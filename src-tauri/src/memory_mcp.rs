use serde_json::{json, Value};
use std::fs::OpenOptions;
use std::io::{BufRead, BufReader, Write};
use std::path::{Path, PathBuf};

use crate::memory_events::{append_event, read_events, MemoryEvent};
use crate::memory_host::{
    daily_rel, memory_root, read_capped, resolve_under, today_stamp, write_capped, MAX_FILE_BYTES,
};

pub const MEMORY_MCP_NAME: &str = "grok-build-memory";
pub const USER_MD_COMPACT_LIMIT: usize = 4000;
const MAX_APPEND_LINES: usize = 20;
const MAX_LINE_CHARS: usize = 2000;
const PROTOCOL: &str = "2024-11-05";

#[derive(Clone)]
pub struct McpCtx {
    pub root: PathBuf,
}

impl McpCtx {
    pub fn live() -> Self {
        Self { root: memory_root() }
    }
}

pub fn looks_like_secret(text: &str) -> bool {
    regex_lite_secret(text)
}

fn regex_lite_secret(text: &str) -> bool {
    let lower = text.to_ascii_lowercase();
    if lower.contains("sk-")
        || lower.contains("sk_live_")
        || lower.contains("sk_test_")
        || lower.contains("ghp_")
        || lower.contains("github_pat_")
        || lower.contains("gho_")
        || lower.contains("xai-")
        || lower.contains("akia")
        || lower.contains("api_key")
        || lower.contains("api-key")
        || lower.contains("-----begin")
        || lower.contains("xoxb-")
        || lower.contains("xoxp-")
        || lower.contains("xoxa-")
        || lower.contains("xoxr-")
        || lower.contains("glpat-")
        || lower.contains("bearer ")
    {
        return true;
    }
    quoted_high_entropy(text)
}

fn quoted_high_entropy(text: &str) -> bool {
    let bytes = text.as_bytes();
    let mut i = 0;
    while i < bytes.len() {
        if bytes[i] == b'"' || bytes[i] == b'\'' {
            let quote = bytes[i];
            i += 1;
            let start = i;
            while i < bytes.len() && bytes[i] != quote {
                i += 1;
            }
            if looks_tokenish(&text[start..i]) {
                return true;
            }
            if i < bytes.len() {
                i += 1;
            }
        } else {
            i += 1;
        }
    }
    false
}

fn looks_tokenish(s: &str) -> bool {
    if s.len() < 32 {
        return false;
    }
    let digits = s.chars().filter(|c| c.is_ascii_digit()).count();
    let alnum = s.chars().filter(|c| c.is_ascii_alphanumeric()).count();
    digits >= 4 && alnum * 100 / s.len() >= 80
}

pub fn compact_user_md(text: &str, limit: usize) -> String {
    let ends_nl = text.ends_with('\n');
    let trimmed = text.trim_end_matches(|c: char| c.is_whitespace() && c != '\n');
    let src = if ends_nl && !trimmed.ends_with('\n') {
        format!("{trimmed}\n")
    } else {
        trimmed.to_string()
    };
    if src.len() <= limit {
        return text.to_string();
    }
    let parts: Vec<&str> = {
        let mut out = Vec::new();
        let mut start = 0;
        let bytes = src.as_bytes();
        let mut i = 0;
        while i + 1 < bytes.len() {
            if bytes[i] == b'\n' && bytes[i + 1] == b'#' && i + 2 < bytes.len() && bytes[i + 2] == b' ' {
                out.push(&src[start..i]);
                start = i + 1;
            }
            i += 1;
        }
        out.push(&src[start..]);
        out
    };
    let mut acc = String::new();
    for part in parts {
        let next = if acc.is_empty() {
            part.to_string()
        } else {
            format!("{acc}\n{part}")
        };
        if next.len() > limit {
            break;
        }
        acc = next;
    }
    if acc.is_empty() {
        src.chars().take(limit).collect()
    } else {
        acc
    }
}

fn map_agent(raw: &str) -> String {
    match raw.trim() {
        "grok" | "kimi" | "claude" | "codex" => raw.trim().to_string(),
        _ => "external".into(),
    }
}

fn valid_kind(kind: &str) -> bool {
    matches!(kind, "user_pref" | "user_utterance" | "agent_commitment")
}

fn lock_path(root: &Path) -> PathBuf {
    root.join(".dreams").join("memory.lock")
}

fn with_lock<T>(root: &Path, f: impl FnOnce() -> Result<T, String>) -> Result<T, String> {
    let path = lock_path(root);
    if let Some(parent) = path.parent() {
        std::fs::create_dir_all(parent).map_err(|e| e.to_string())?;
    }
    let file = OpenOptions::new()
        .create(true)
        .truncate(false)
        .read(true)
        .write(true)
        .open(&path)
        .map_err(|e| e.to_string())?;
    use fs2::FileExt;
    file.lock_exclusive().map_err(|e| e.to_string())?;
    let result = f();
    let _ = file.unlock();
    result
}

fn tool_defs() -> Value {
    json!([
        {"name":"memory_get","description":"Read compacted USER.md","inputSchema":{"type":"object","properties":{}}},
        {"name":"memory_recall","description":"Token search over USER.md, DREAMS.md, and recent daily lines","inputSchema":{"type":"object","properties":{"query":{"type":"string"},"limit":{"type":"integer"}},"required":["query"]}},
        {"name":"memory_append","description":"Append tagged daily lines (never writes USER.md)","inputSchema":{"type":"object","properties":{"agent":{"type":"string"},"lines":{"type":"array","items":{"type":"object","properties":{"text":{"type":"string"},"kind":{"type":"string"}},"required":["text"]}}},"required":["agent","lines"]}},
        {"name":"memory_timeline","description":"Recent memory events","inputSchema":{"type":"object","properties":{"limit":{"type":"integer"}}}},
        {"name":"memory_forget","description":"Forget a session id from future ingest","inputSchema":{"type":"object","properties":{"session_id":{"type":"string"}},"required":["session_id"]}}
    ])
}

fn ok_result(id: &Value, payload: Value) -> Value {
    json!({"jsonrpc":"2.0","id":id,"result":payload})
}

fn err_result(id: &Value, code: i64, message: &str) -> Value {
    json!({"jsonrpc":"2.0","id":id,"error":{"code":code,"message":message}})
}

fn tool_text(value: Value) -> Value {
    json!({"content":[{"type":"text","text": value.to_string()}]})
}

fn tool_error(id: &Value, message: &str) -> Value {
    ok_result(id, json!({"content":[{"type":"text","text": message}],"isError":true}))
}

pub fn handle_rpc(ctx: &McpCtx, req: &Value) -> Option<Value> {
    let method = req.get("method")?.as_str()?.to_string();
    let id = req.get("id")?.clone();
    let params = req.get("params").cloned().unwrap_or(json!({}));
    let out = match method.as_str() {
        "initialize" => ok_result(
            &id,
            json!({
                "protocolVersion": PROTOCOL,
                "capabilities": {"tools":{}, "resources":{}},
                "serverInfo": {"name": MEMORY_MCP_NAME, "version": env!("CARGO_PKG_VERSION")}
            }),
        ),
        "ping" => ok_result(&id, json!({})),
        "tools/list" => ok_result(&id, json!({"tools": tool_defs()})),
        "resources/list" => ok_result(
            &id,
            json!({"resources":[
                {"uri":"memory://user.md","name":"USER.md","mimeType":"text/markdown"},
                {"uri":"memory://dreams.md","name":"DREAMS.md","mimeType":"text/markdown"}
            ]}),
        ),
        "resources/read" => match read_resource(ctx, &params) {
            Ok(v) => ok_result(&id, v),
            Err(e) => err_result(&id, -32000, &e),
        },
        "tools/call" => call_tool(ctx, &id, &params),
        _ => err_result(&id, -32601, "method not found"),
    };
    Some(out)
}

fn read_resource(ctx: &McpCtx, params: &Value) -> Result<Value, String> {
    let uri = params.get("uri").and_then(|v| v.as_str()).unwrap_or("");
    let rel = match uri {
        "memory://user.md" => Path::new("USER.md"),
        "memory://dreams.md" => Path::new("DREAMS.md"),
        _ => return Err("unknown resource".into()),
    };
    let path = resolve_under(&ctx.root, rel)?;
    let text = read_capped(&path)?;
    Ok(json!({"contents":[{"uri": uri, "mimeType":"text/markdown","text": text}]}))
}

fn call_tool(ctx: &McpCtx, id: &Value, params: &Value) -> Value {
    let name = params.get("name").and_then(|v| v.as_str()).unwrap_or("");
    let args = params.get("arguments").cloned().unwrap_or(json!({}));
    let result = match name {
        "memory_get" => memory_get(ctx),
        "memory_recall" => memory_recall(ctx, &args),
        "memory_append" => memory_append(ctx, &args),
        "memory_timeline" => memory_timeline(ctx, &args),
        "memory_forget" => memory_forget(ctx, &args),
        _ => Err("unknown tool".into()),
    };
    match result {
        Ok(v) => ok_result(id, tool_text(v)),
        Err(e) => tool_error(id, &e),
    }
}

fn memory_get(ctx: &McpCtx) -> Result<Value, String> {
    let path = resolve_under(&ctx.root, Path::new("USER.md"))?;
    let text = compact_user_md(&read_capped(&path)?, USER_MD_COMPACT_LIMIT);
    let updated = std::fs::metadata(&path)
        .ok()
        .and_then(|m| m.modified().ok())
        .and_then(|t| t.duration_since(std::time::UNIX_EPOCH).ok())
        .map(|d| d.as_millis() as i64);
    Ok(json!({"text": text, "updated_at": updated}))
}

fn tokenize(s: &str) -> Vec<String> {
    s.to_lowercase()
        .split(|c: char| !c.is_alphanumeric())
        .filter(|t| t.len() >= 2)
        .map(|t| t.to_string())
        .collect()
}

fn score_text(query: &[String], text: &str) -> i64 {
    let hay = text.to_lowercase();
    query.iter().filter(|q| hay.contains(q.as_str())).count() as i64
}

fn memory_recall(ctx: &McpCtx, args: &Value) -> Result<Value, String> {
    let query = args.get("query").and_then(|v| v.as_str()).unwrap_or("").trim();
    if query.is_empty() {
        return Ok(json!([]));
    }
    let limit = args.get("limit").and_then(|v| v.as_u64()).unwrap_or(8).min(20) as usize;
    let tokens = tokenize(query);
    let mut hits: Vec<(i64, &'static str, String)> = Vec::new();
    let user = read_capped(&resolve_under(&ctx.root, Path::new("USER.md"))?)?;
    for para in user.split("\n\n") {
        let s = score_text(&tokens, para);
        if s > 0 {
            hits.push((s, "USER.md", para.trim().to_string()));
        }
    }
    let dreams = read_capped(&resolve_under(&ctx.root, Path::new("DREAMS.md"))?)?;
    for chunk in dreams.split("\n## ") {
        let s = score_text(&tokens, chunk);
        if s > 0 {
            hits.push((s, "DREAMS.md", chunk.trim().to_string()));
        }
    }
    let daily_dir = ctx.root.join("daily");
    if let Ok(entries) = std::fs::read_dir(&daily_dir) {
        let mut files: Vec<_> = entries.flatten().map(|e| e.path()).collect();
        files.sort();
        for path in files.into_iter().rev().take(14) {
            if let Ok(raw) = std::fs::read_to_string(&path) {
                for line in raw.lines().filter(|l| l.starts_with("- [")) {
                    let s = score_text(&tokens, line);
                    if s > 0 {
                        hits.push((s, "daily", line.to_string()));
                    }
                }
            }
        }
    }
    hits.sort_by_key(|a| std::cmp::Reverse(a.0));
    hits.truncate(limit);
    let out: Vec<Value> = hits
        .into_iter()
        .map(|(score, source, text)| json!({"text": text, "source": source, "score": score}))
        .collect();
    Ok(json!(out))
}

fn memory_append(ctx: &McpCtx, args: &Value) -> Result<Value, String> {
    let agent = map_agent(args.get("agent").and_then(|v| v.as_str()).unwrap_or("external"));
    let lines = args.get("lines").and_then(|v| v.as_array()).cloned().unwrap_or_default();
    if lines.is_empty() {
        return Err("no lines".into());
    }
    if lines.len() > MAX_APPEND_LINES {
        return Err("too many lines".into());
    }
    let day = today_stamp();
    with_lock(&ctx.root, || {
        let rel = daily_rel(&day, 1)?;
        let path = resolve_under(&ctx.root, &rel)?;
        let mut body = read_capped(&path)?;
        if body.trim().is_empty() {
            body = format!("# {day}\n");
        } else if !body.ends_with('\n') {
            body.push('\n');
        }
        let mut appended = 0i64;
        for row in &lines {
            let text = row.get("text").and_then(|v| v.as_str()).unwrap_or("").trim();
            let kind = row.get("kind").and_then(|v| v.as_str()).unwrap_or("user_utterance");
            if text.is_empty() {
                continue;
            }
            if text.len() > MAX_LINE_CHARS {
                return Err("line too long".into());
            }
            if !valid_kind(kind) {
                return Err("invalid kind".into());
            }
            if looks_like_secret(text) {
                return Err("secret-like text refused".into());
            }
            let line = format!("- [{agent} | mcp | . | {kind}] {text}\n");
            if body.len() + line.len() > MAX_FILE_BYTES {
                return Err("file exceeds 64 KiB size limit".into());
            }
            body.push_str(&line);
            appended += 1;
        }
        if appended == 0 {
            return Err("no lines".into());
        }
        write_capped(&path, &body)?;
        let now = std::time::SystemTime::now()
            .duration_since(std::time::UNIX_EPOCH)
            .map(|d| d.as_millis() as i64)
            .unwrap_or(0);
        append_event(
            &ctx.root,
            &MemoryEvent {
                at: now,
                kind: "mcp_append".into(),
                agent: Some(agent.clone()),
                count: Some(appended),
                bytes: None,
                prompts: None,
                in_chars: None,
                out_chars: None,
            },
        )?;
        bump_pending_mcp(&ctx.root)?;
        Ok(json!({"appended": appended, "day": day}))
    })
}

fn bump_pending_mcp(root: &Path) -> Result<(), String> {
    let path = resolve_under(root, Path::new(".dreams").join("state.json").as_path())?;
    let raw = read_capped(&path)?;
    let mut v: Value = if raw.trim().is_empty() {
        json!({})
    } else {
        serde_json::from_str(&raw).unwrap_or(json!({}))
    };
    let sessions = v
        .pointer("/pendingSinceDeep/sessions")
        .and_then(|x| x.as_i64())
        .unwrap_or(0);
    let batches = v
        .pointer("/pendingSinceDeep/mcpBatches")
        .and_then(|x| x.as_i64())
        .unwrap_or(0)
        + 1;
    v["pendingSinceDeep"] = json!({"sessions": sessions, "mcpBatches": batches});
    write_capped(&path, &format!("{v}"))
}

fn memory_timeline(ctx: &McpCtx, args: &Value) -> Result<Value, String> {
    let limit = args.get("limit").and_then(|v| v.as_u64()).unwrap_or(40).min(200) as usize;
    let mut events = read_events(&ctx.root)?;
    events.reverse();
    events.truncate(limit);
    let out: Vec<Value> = events
        .into_iter()
        .map(|e| {
            json!({
                "at": e.at,
                "kind": e.kind,
                "label": e.kind,
                "agent": e.agent,
                "count": e.count
            })
        })
        .collect();
    Ok(json!(out))
}

fn memory_forget(ctx: &McpCtx, args: &Value) -> Result<Value, String> {
    let session = args
        .get("session_id")
        .and_then(|v| v.as_str())
        .unwrap_or("")
        .trim();
    if session.is_empty() || session.len() > 200 {
        return Err("invalid session_id".into());
    }
    with_lock(&ctx.root, || {
        let path = resolve_under(&ctx.root, Path::new(".dreams").join("state.json").as_path())?;
        let raw = read_capped(&path)?;
        let mut v: Value = if raw.trim().is_empty() {
            json!({"forgotten": []})
        } else {
            serde_json::from_str(&raw).unwrap_or(json!({"forgotten": []}))
        };
        let mut list: Vec<String> = v
            .get("forgotten")
            .and_then(|x| x.as_array())
            .map(|a| {
                a.iter()
                    .filter_map(|x| x.as_str().map(|s| s.to_string()))
                    .collect()
            })
            .unwrap_or_default();
        if !list.iter().any(|s| s == session) {
            list.push(session.to_string());
        }
        v["forgotten"] = json!(list);
        write_capped(&path, &format!("{v}"))?;
        Ok(json!({"ok": true}))
    })
}

pub fn sidecar_filename() -> &'static str {
    if cfg!(windows) {
        "memory-mcp.exe"
    } else {
        "memory-mcp"
    }
}

pub fn installed_bin_path() -> PathBuf {
    memory_root()
        .parent()
        .unwrap_or_else(|| Path::new("."))
        .join("bin")
        .join(sidecar_filename())
}

pub fn resolve_sidecar_source() -> Option<PathBuf> {
    let name = sidecar_filename();
    let mut cands = Vec::new();
    if let Ok(exe) = std::env::current_exe() {
        if let Some(dir) = exe.parent() {
            cands.push(dir.join(name));
            #[cfg(target_os = "macos")]
            {
                cands.push(dir.join(format!("memory-mcp-{}", std::env::consts::ARCH)));
            }
        }
    }
    let manifest = PathBuf::from(env!("CARGO_MANIFEST_DIR"));
    cands.push(manifest.join("target/debug").join(name));
    cands.push(manifest.join("target/release").join(name));
    cands.push(installed_bin_path());
    cands.into_iter().find(|p| p.is_file())
}

pub fn install_sidecar() -> Result<PathBuf, String> {
    let dest = installed_bin_path();
    let src = resolve_sidecar_source().ok_or_else(|| "memory-mcp binary not found".to_string())?;
    if src != dest {
        if let Some(parent) = dest.parent() {
            std::fs::create_dir_all(parent).map_err(|e| e.to_string())?;
        }
        std::fs::copy(&src, &dest).map_err(|e| e.to_string())?;
        #[cfg(unix)]
        {
            use std::os::unix::fs::PermissionsExt;
            let mut perms = std::fs::metadata(&dest).map_err(|e| e.to_string())?.permissions();
            perms.set_mode(0o755);
            std::fs::set_permissions(&dest, perms).map_err(|e| e.to_string())?;
        }
    }
    Ok(dest)
}

#[derive(serde::Serialize)]
#[serde(rename_all = "camelCase")]
pub struct MemoryMcpStatus {
    pub path: String,
    pub executable: bool,
    pub registered: bool,
}

pub fn status_snapshot() -> MemoryMcpStatus {
    let path = resolve_sidecar_source()
        .or_else(|| {
            let p = installed_bin_path();
            p.is_file().then_some(p)
        });
    let catalog = crate::agents_paths::agents_home_from(
        &crate::dirs_home(),
        std::env::var("ACP_AGENTS_HOME").ok().as_deref(),
    )
    .join("mcp.json");
    let registered = std::fs::read_to_string(catalog)
        .ok()
        .map(|s| s.contains(MEMORY_MCP_NAME))
        .unwrap_or(false);
    MemoryMcpStatus {
        path: path
            .as_ref()
            .map(|p| p.display().to_string())
            .unwrap_or_default(),
        executable: path.as_ref().map(|p| p.is_file()).unwrap_or(false),
        registered,
    }
}

#[tauri::command]
pub fn install_memory_mcp() -> Result<MemoryMcpStatus, String> {
    let path = install_sidecar()?;
    let mut snap = status_snapshot();
    snap.path = path.display().to_string();
    snap.executable = true;
    Ok(snap)
}

#[tauri::command]
pub fn memory_mcp_status() -> MemoryMcpStatus {
    status_snapshot()
}

pub fn run_stdio() {
    let ctx = McpCtx::live();
    let stdin = std::io::stdin();
    let mut stdout = std::io::stdout();
    let reader = BufReader::new(stdin.lock());
    for line in reader.lines() {
        let Ok(line) = line else { break };
        let trimmed = line.trim();
        if trimmed.is_empty() {
            continue;
        }
        let Ok(req) = serde_json::from_str::<Value>(trimmed) else {
            continue;
        };
        if let Some(resp) = handle_rpc(&ctx, &req) {
            if writeln!(stdout, "{resp}").is_err() {
                break;
            }
            let _ = stdout.flush();
        }
    }
}

#[cfg(test)]
mod tests {
    use super::*;
    use std::sync::atomic::{AtomicU64, Ordering};

    fn temp_ctx() -> McpCtx {
        static NEXT: AtomicU64 = AtomicU64::new(0);
        let n = NEXT.fetch_add(1, Ordering::Relaxed);
        let dir = std::env::temp_dir().join(format!(
            "memory-mcp-{}-{}-{}",
            std::process::id(),
            n,
            std::time::SystemTime::now()
                .duration_since(std::time::UNIX_EPOCH)
                .map(|d| d.as_nanos())
                .unwrap_or(0)
        ));
        let _ = std::fs::remove_dir_all(&dir);
        std::fs::create_dir_all(&dir).unwrap();
        McpCtx { root: dir }
    }

    fn rpc(ctx: &McpCtx, method: &str, params: Value) -> Value {
        handle_rpc(
            ctx,
            &json!({"jsonrpc":"2.0","id":1,"method":method,"params":params}),
        )
        .unwrap()
    }

    fn call(ctx: &McpCtx, name: &str, args: Value) -> Value {
        rpc(ctx, "tools/call", json!({"name": name, "arguments": args}))
    }

    fn parse_tool(resp: &Value) -> Value {
        let text = resp["result"]["content"][0]["text"].as_str().unwrap();
        serde_json::from_str(text).unwrap()
    }

    #[test]
    fn initialize_and_tools_list() {
        let ctx = temp_ctx();
        let init = rpc(&ctx, "initialize", json!({}));
        assert_eq!(init["result"]["protocolVersion"], PROTOCOL);
        let listed = rpc(&ctx, "tools/list", json!({}));
        let tools = listed["result"]["tools"].as_array().unwrap();
        assert_eq!(tools.len(), 5);
    }

    #[test]
    fn get_compacts_user_md() {
        let ctx = temp_ctx();
        std::fs::write(ctx.root.join("USER.md"), "# You\n- likes tests\n").unwrap();
        let got = parse_tool(&call(&ctx, "memory_get", json!({})));
        assert!(got["text"].as_str().unwrap().contains("likes tests"));
    }

    #[test]
    fn append_writes_tagged_line_and_event() {
        let ctx = temp_ctx();
        let out = parse_tool(&call(
            &ctx,
            "memory_append",
            json!({"agent":"codex","lines":[{"text":"prefer pnpm","kind":"user_pref"}]}),
        ));
        assert_eq!(out["appended"], 1);
        let daily = std::fs::read_to_string(ctx.root.join("daily").join(format!("{}.md", out["day"].as_str().unwrap()))).unwrap();
        assert!(daily.contains("- [codex | mcp | . | user_pref] prefer pnpm"));
        let events = read_events(&ctx.root).unwrap();
        assert_eq!(events[0].kind, "mcp_append");
        let state = std::fs::read_to_string(ctx.root.join(".dreams").join("state.json")).unwrap();
        assert!(state.contains("mcpBatches"));
    }

    #[test]
    fn append_rejects_secret_and_oversize() {
        let ctx = temp_ctx();
        let resp = call(
            &ctx,
            "memory_append",
            json!({"agent":"grok","lines":[{"text":"sk-abc","kind":"user_pref"}]}),
        );
        assert_eq!(resp["result"]["isError"], true);
        let too_many: Vec<Value> = (0..21)
            .map(|i| json!({"text": format!("line {i}"), "kind":"user_utterance"}))
            .collect();
        let resp = call(&ctx, "memory_append", json!({"agent":"grok","lines": too_many}));
        assert_eq!(resp["result"]["isError"], true);
    }

    #[test]
    fn looks_like_secret_covers_slack_gitlab_pem_and_bearer() {
        assert!(looks_like_secret("sk-abc"));
        assert!(looks_like_secret("xoxb-1234-slack"));
        assert!(looks_like_secret("glpat-abc"));
        assert!(looks_like_secret("-----BEGIN RSA PRIVATE KEY-----"));
        assert!(looks_like_secret("Authorization: Bearer eyJhbGciOi"));
        assert!(looks_like_secret(
            r#"token="aB3dE5fG7hI9jK1lM2nO3pQ4rS5tU6vW""#
        ));
        assert!(!looks_like_secret("prefer pnpm for this repo"));
    }

    #[test]
    fn forget_and_recall() {
        let ctx = temp_ctx();
        std::fs::write(ctx.root.join("USER.md"), "# You\n- loves rust tests\n").unwrap();
        let hits = parse_tool(&call(&ctx, "memory_recall", json!({"query":"rust"})));
        assert!(hits.as_array().unwrap()[0]["text"].as_str().unwrap().contains("rust"));
        let out = parse_tool(&call(&ctx, "memory_forget", json!({"session_id":"s1"})));
        assert_eq!(out["ok"], true);
        let state = std::fs::read_to_string(ctx.root.join(".dreams").join("state.json")).unwrap();
        assert!(state.contains("s1"));
    }

    #[test]
    fn concurrent_appends_do_not_drop_lines() {
        let ctx = temp_ctx();
        std::thread::scope(|scope| {
            for t in 0..2 {
                let ctx = ctx.clone();
                scope.spawn(move || {
                    for i in 0..50 {
                        let _ = memory_append(
                            &ctx,
                            &json!({"agent":"grok","lines":[{"text": format!("n-{t}-{i}"), "kind":"user_utterance"}]}),
                        );
                    }
                });
            }
        });
        let day = today_stamp();
        let body = std::fs::read_to_string(ctx.root.join("daily").join(format!("{day}.md"))).unwrap();
        let n = body.lines().filter(|l| l.starts_with("- [")).count();
        assert_eq!(n, 100);
    }

    #[test]
    fn compact_user_md_keeps_heading_chunks() {
        let a = "# A\n".to_string() + &"x".repeat(80) + "\n";
        let b = "# B\n".to_string() + &"y".repeat(80) + "\n";
        let out = compact_user_md(&(a.clone() + &b), 120);
        assert!(out.starts_with("# A"));
        assert!(!out.contains("# B"));
    }
}
