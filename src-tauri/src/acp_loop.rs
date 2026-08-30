use serde_json::{json, Value};
use std::path::Path;
use std::sync::Arc;
use tauri::{AppHandle, Emitter, Manager};
use tokio::io::{AsyncBufReadExt, AsyncWriteExt, BufReader};
use tokio::process::ChildStdin;
use tokio::sync::mpsc;

use crate::agent_host::{parse_stdout_line, tagged_acp_event, AgentId, ParsedStdio};
use crate::{AppError, AppResult, AppState, PathAccess, MAX_FS_BYTES};

pub(crate) async fn write_line(stdin: &mut ChildStdin, line: &str) -> AppResult<()> {
    stdin
        .write_all(line.as_bytes())
        .await
        .map_err(|e| AppError::Message(format!("write grok stdin: {e}")))?;
    if !line.ends_with('\n') {
        stdin
            .write_all(b"\n")
            .await
            .map_err(|e| AppError::Message(format!("write grok stdin: {e}")))?;
    }
    stdin
        .flush()
        .await
        .map_err(|e| AppError::Message(format!("flush grok stdin: {e}")))
}

pub(crate) fn handle_agent_request(
    app: &AppHandle,
    msg: &Value,
    workspace: Option<&Path>,
    agent_id: AgentId,
    generation: u64,
) -> Option<Value> {
    let method = msg.get("method")?.as_str()?;
    let id = msg.get("id")?.clone();
    let params = msg.get("params").cloned().unwrap_or(json!({}));

    match method {
        "fs/read_text_file" | "x.ai/fs/read_file" => {
            let path = params.get("path").and_then(|v| v.as_str()).unwrap_or("");
            let limit = params.get("limit").and_then(|v| v.as_u64());
            match crate::resolve_allowed_path(path, workspace, PathAccess::Read) {
                Ok(path) => match std::fs::read_to_string(&path) {
                    Ok(mut content) => {
                        if content.len() > MAX_FS_BYTES {
                            content.truncate(MAX_FS_BYTES);
                        }
                        if let Some(n) = limit {
                            content = content.lines().take(n as usize).collect::<Vec<_>>().join("\n");
                        }
                        Some(json!({ "jsonrpc": "2.0", "id": id, "result": { "content": content } }))
                    }
                    Err(e) => Some(json!({
                        "jsonrpc": "2.0",
                        "id": id,
                        "error": { "code": -32000, "message": e.to_string() }
                    })),
                },
                Err(e) => Some(json!({
                    "jsonrpc": "2.0",
                    "id": id,
                    "error": { "code": -32000, "message": e }
                })),
            }
        }
        "fs/write_text_file" | "x.ai/fs/write_file" => {
            let path = params.get("path").and_then(|v| v.as_str()).unwrap_or("");
            let content = params.get("content").and_then(|v| v.as_str()).unwrap_or("");
            if content.len() > MAX_FS_BYTES {
                return Some(json!({
                    "jsonrpc": "2.0",
                    "id": id,
                    "error": { "code": -32001, "message": "write too large" }
                }));
            }
            match crate::resolve_allowed_path(path, workspace, PathAccess::Write) {
                Ok(path) => match std::fs::write(&path, content) {
                    Ok(()) => Some(json!({ "jsonrpc": "2.0", "id": id, "result": {} })),
                    Err(e) => Some(json!({
                        "jsonrpc": "2.0",
                        "id": id,
                        "error": { "code": -32000, "message": e.to_string() }
                    })),
                },
                Err(e) => Some(json!({
                    "jsonrpc": "2.0",
                    "id": id,
                    "error": { "code": -32000, "message": e }
                })),
            }
        }
        _ => {
            let _ = app.emit(
                "acp-request",
                tagged_acp_event(agent_id, generation, msg.clone()),
            );
            None
        }
    }
}

pub(crate) fn spawn_reader(
    app: AppHandle,
    stdout: tokio::process::ChildStdout,
    stderr: tokio::process::ChildStderr,
    tx: mpsc::Sender<String>,
    generation: u64,
    agent_id: AgentId,
) {
    let app_out = app.clone();
    let app_err = app.clone();
    tauri::async_runtime::spawn(async move {
        let mut lines = BufReader::new(stdout).lines();
        loop {
            match lines.next_line().await {
                Ok(Some(line)) => match parse_stdout_line(&line) {
                    ParsedStdio::Skip => continue,
                    ParsedStdio::Request(msg) => {
                        let sid = msg
                            .get("params")
                            .and_then(|p| p.get("sessionId"))
                            .and_then(|v| v.as_str())
                            .map(str::to_string);
                        let workspace = app_out.try_state::<Arc<AppState>>().and_then(|s| {
                            if let Some(id) = sid.as_deref() {
                                if let Ok(map) = s.workspaces.try_lock() {
                                    if let Some(p) = map.get(id) {
                                        return Some(p.clone());
                                    }
                                }
                            }
                            s.workspace.try_lock().ok().and_then(|g| g.clone())
                        });
                        if let Some(reply) = handle_agent_request(
                            &app_out,
                            &msg,
                            workspace.as_deref(),
                            agent_id,
                            generation,
                        ) {
                            let _ = tx.send(reply.to_string()).await;
                            continue;
                        }
                        let _ = app_out.emit(
                            "acp-message",
                            tagged_acp_event(agent_id, generation, msg),
                        );
                    }
                    ParsedStdio::Message(msg) => {
                        let _ = app_out.emit(
                            "acp-message",
                            tagged_acp_event(agent_id, generation, msg),
                        );
                    }
                    ParsedStdio::Log(text) => {
                        let _ = app_out.emit(
                            "acp-log",
                            tagged_acp_event(agent_id, generation, json!(text)),
                        );
                    }
                },
                Ok(None) => break,
                Err(e) => {
                    let _ = app_out.emit(
                        "acp-stderr",
                        tagged_acp_event(agent_id, generation, json!(format!("stdout read error: {e}"))),
                    );
                    break;
                }
            }
        }
        let _ = app_out.emit(
            "agent-exit",
            tagged_acp_event(agent_id, generation, Value::Null),
        );
    });

    tauri::async_runtime::spawn(async move {
        let mut lines = BufReader::new(stderr).lines();
        while let Ok(Some(line)) = lines.next_line().await {
            if !line.trim().is_empty() {
                let _ = app_err.emit(
                    "acp-stderr",
                    tagged_acp_event(agent_id, generation, json!(line)),
                );
            }
        }
    });
}

pub(crate) fn spawn_writer(mut stdin: ChildStdin, mut rx: mpsc::Receiver<String>) {
    tauri::async_runtime::spawn(async move {
        while let Some(line) = rx.recv().await {
            if write_line(&mut stdin, &line).await.is_err() {
                break;
            }
        }
    });
}
