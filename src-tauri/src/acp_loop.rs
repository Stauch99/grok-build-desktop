use serde_json::{json, Value};
use std::path::Path;
use std::sync::Arc;
use std::time::Instant;
use tauri::{AppHandle, Emitter, Manager};
use tokio::io::{AsyncBufReadExt, AsyncWriteExt, BufReader};
use tokio::process::ChildStdin;
use tokio::sync::mpsc;

use crate::agent_host::{parse_stdout_line, tagged_acp_event, AgentId, ParsedStdio};
use crate::{AppError, AppResult, AppState, PathAccess, MAX_FS_BYTES};

/// Upper bound for a single stdout/stderr line. A CLI that emits one huge
/// JSON blob (or a runaway log line) must not grow memory without limit.
pub(crate) const MAX_STDIO_LINE: usize = 1024 * 1024;

/// stderr lines are merged on this cadence so a chatty CLI cannot flood IPC.
pub(crate) const STDERR_MERGE_MS: u64 = 200;

/// Reads one `\n`-terminated line without unbounded buffering. Returns the
/// line (lossily decoded, so invalid UTF-8 can never kill the reader) plus
/// whether it was cut at `max` bytes.
pub(crate) async fn next_bounded_line<R>(
    reader: &mut BufReader<R>,
    max: usize,
) -> std::io::Result<Option<(String, bool)>>
where
    R: tokio::io::AsyncRead + Unpin,
{
    let mut buf: Vec<u8> = Vec::new();
    let mut truncated = false;
    loop {
        let available = reader.fill_buf().await?;
        if available.is_empty() {
            break;
        }
        match available.iter().position(|&b| b == b'\n') {
            Some(pos) => {
                if buf.len() < max {
                    let take = (max - buf.len()).min(pos);
                    buf.extend_from_slice(&available[..take]);
                    if take < pos {
                        truncated = true;
                    }
                } else {
                    truncated = true;
                }
                reader.consume(pos + 1);
                break;
            }
            None => {
                let len = available.len();
                let room = max.saturating_sub(buf.len());
                let take = room.min(len);
                if take > 0 {
                    buf.extend_from_slice(&available[..take]);
                }
                reader.consume(len);
                if room == 0 {
                    truncated = true;
                }
            }
        }
    }
    if buf.is_empty() && !truncated {
        return Ok(None);
    }
    let mut text = String::from_utf8_lossy(&buf).into_owned();
    if text.ends_with('\r') {
        text.pop();
    }
    if truncated {
        text.push_str(" …[line too long, truncated]");
    }
    Ok(Some((text, truncated)))
}

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
                            // String::truncate panics unless the cut lands on a
                            // char boundary; fall back to the nearest one.
                            let mut cut = MAX_FS_BYTES;
                            while cut > 0 && !content.is_char_boundary(cut) {
                                cut -= 1;
                            }
                            content.truncate(cut);
                        }
                        if let Some(n) = limit {
                            content = content
                                .lines()
                                .take(n as usize)
                                .collect::<Vec<_>>()
                                .join("\n");
                        }
                        Some(
                            json!({ "jsonrpc": "2.0", "id": id, "result": { "content": content } }),
                        )
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
                Ok(path) => match crate::cli_bridge::write_nofollow(&path, content.as_bytes()) {
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
    tauri::async_runtime::spawn(async move {
        let mut reader = BufReader::new(stdout);
        loop {
            match next_bounded_line(&mut reader, MAX_STDIO_LINE).await {
                Ok(Some((line, _))) => match parse_stdout_line(&line) {
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
                        let _ = app_out
                            .emit("acp-message", tagged_acp_event(agent_id, generation, msg));
                    }
                    ParsedStdio::Message(msg) => {
                        let _ = app_out
                            .emit("acp-message", tagged_acp_event(agent_id, generation, msg));
                    }
                    // Non-JSON log lines have no frontend consumer; emitting
                    // them unthrottled turned into an IPC storm under noisy
                    // CLIs, so they are dropped here.
                    ParsedStdio::Log(_) => continue,
                },
                Ok(None) => break,
                Err(e) => {
                    let _ = app_out.emit(
                        "acp-stderr",
                        tagged_acp_event(
                            agent_id,
                            generation,
                            json!(format!("stdout read error: {e}")),
                        ),
                    );
                    break;
                }
            }
        }
        // agent-exit is emitted by spawn_exit_watcher once the real exit
        // status is known; stdout EOF alone does not mean the child died.
    });

    tauri::async_runtime::spawn(async move {
        let mut reader = BufReader::new(stderr);
        let app_err = app;
        let mut pending: Vec<String> = Vec::new();
        let mut flush =
            tokio::time::interval(std::time::Duration::from_millis(STDERR_MERGE_MS));
        flush.set_missed_tick_behavior(tokio::time::MissedTickBehavior::Skip);
        loop {
            tokio::select! {
                item = next_bounded_line(&mut reader, MAX_STDIO_LINE) => {
                    match item {
                        Ok(Some((line, _))) => {
                            if !line.trim().is_empty() {
                                pending.push(line);
                                if pending.len() >= 64 {
                                    let merged = pending.join("\n");
                                    let _ = app_err.emit(
                                        "acp-stderr",
                                        tagged_acp_event(
                                            agent_id,
                                            generation,
                                            json!(merged),
                                        ),
                                    );
                                    pending.clear();
                                }
                            }
                        }
                        Ok(None) | Err(_) => break,
                    }
                }
                _ = flush.tick() => {
                    if !pending.is_empty() {
                        let merged = pending.join("\n");
                        let _ = app_err.emit(
                            "acp-stderr",
                            tagged_acp_event(agent_id, generation, json!(merged)),
                        );
                        pending.clear();
                    }
                }
            }
        }
        if !pending.is_empty() {
            let merged = pending.join("\n");
            let _ = app_err.emit(
                "acp-stderr",
                tagged_acp_event(agent_id, generation, json!(merged)),
            );
        }
    });
}

/// Watches the pooled child until it exits (emitting `agent-exit` with the
/// real exit status) or is removed from the pool (user stop/restart → a
/// `stopped` payload the frontend can tell apart from a crash).
pub(crate) fn spawn_exit_watcher(
    app: AppHandle,
    state: Arc<AppState>,
    agent_id: AgentId,
    generation: u64,
    spawned_at: Instant,
) {
    tauri::async_runtime::spawn(async move {
        let mut ticker = tokio::time::interval(std::time::Duration::from_millis(500));
        ticker.set_missed_tick_behavior(tokio::time::MissedTickBehavior::Skip);
        ticker.tick().await;
        loop {
            ticker.tick().await;
            let mut exit_payload: Option<Value> = None;
            let mut retire = false;
            if let Ok(mut pool) = state.children.try_lock() {
                match watcher_pool_action(
                    pool.get(agent_id).map(|session| session.generation),
                    generation,
                ) {
                    WatcherPoolAction::Retire => retire = true,
                    WatcherPoolAction::EmitStopped => {
                        exit_payload = Some(json!({ "stopped": true }));
                    }
                    WatcherPoolAction::PollExit => {
                        if let Some(session) = pool.get_mut(agent_id) {
                            if let Ok(Some(status)) = session.child.try_wait() {
                                let code = status.code();
                                #[cfg(unix)]
                                let signal = {
                                    use std::os::unix::process::ExitStatusExt;
                                    status.signal()
                                };
                                #[cfg(not(unix))]
                                let signal: Option<i32> = None;
                                pool.remove(agent_id);
                                exit_payload = Some(json!({
                                    "code": code,
                                    "signal": signal,
                                    "uptimeMs": spawned_at.elapsed().as_millis() as u64,
                                }));
                            }
                        }
                    }
                }
            }
            if retire {
                break;
            }
            if let Some(payload) = exit_payload {
                let _ = app.emit("agent-exit", tagged_acp_event(agent_id, generation, payload));
                break;
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

/// What a generation's exit watcher should do when it observes the pool.
#[derive(Debug, Clone, Copy, PartialEq, Eq)]
pub(crate) enum WatcherPoolAction {
    PollExit,
    Retire,
    EmitStopped,
}

pub(crate) fn watcher_pool_action(
    pool_generation: Option<u64>,
    watcher_generation: u64,
) -> WatcherPoolAction {
    match pool_generation {
        Some(g) if g == watcher_generation => WatcherPoolAction::PollExit,
        Some(_) => WatcherPoolAction::Retire,
        None => WatcherPoolAction::EmitStopped,
    }
}

#[cfg(test)]
mod tests {
    use super::*;
    use tokio::io::BufReader;

    #[tokio::test]
    async fn next_bounded_line_strips_cr_so_json_still_parses() {
        let mut reader = BufReader::new(&b"{\"jsonrpc\":\"2.0\",\"result\":{}}\r\n"[..]);
        let (line, truncated) = next_bounded_line(&mut reader, 1024).await.unwrap().unwrap();
        assert!(!truncated);
        assert_eq!(line, r#"{"jsonrpc":"2.0","result":{}}"#);
    }

    #[test]
    fn write_text_file_uses_nofollow() {
        let prod = include_str!("acp_loop.rs")
            .split("#[cfg(test)]")
            .next()
            .unwrap();
        assert!(prod.contains("cli_bridge::write_nofollow"));
        assert!(!prod.contains("std::fs::write(&path, content)"));
    }
}
