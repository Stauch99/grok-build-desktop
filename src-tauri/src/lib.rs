use serde::{Deserialize, Serialize};
use serde_json::{json, Value};
use std::collections::HashMap;
use std::path::{Path, PathBuf};
use std::process::Stdio;
use std::sync::atomic::{AtomicU64, Ordering};
use std::sync::{Arc, OnceLock};
use tauri::{AppHandle, Emitter, Manager, State};
use tokio::process::{Child, Command};
use tokio::sync::{mpsc, Mutex};
use walkdir::WalkDir;

mod cli_bridge;
mod rpc_allowlist;
mod agent_host;
mod agents_paths;
mod agents_files;
mod marketplace;
mod mcp_import;
mod mcp_toml;
mod workbench_state;
mod agent_doctor;
mod adapters;
mod skill_sync;
mod session_scan;
mod session_lookup;
mod acp_loop;
mod agent_registry;
pub(crate) use rpc_allowlist::rpc_payload_allowed;
use agent_host::{
    parse_agent_id_arg, AgentId, AgentPool,
};
use acp_loop::{spawn_reader, spawn_writer};
use rpc_allowlist::{caps_for_agent, rpc_payload_allowed_for};
use cli_bridge::{
    create_skill, git_blame, git_branches, git_commit, git_log, git_status_untracked, hide_window, list_agents_dir, list_file_tree,
    list_imagine_artifacts, list_models_text, list_session_spills, open_in_terminal,
    patch_compat, patch_skills_disabled, read_config_text, read_managed_config, read_models_cache,
    read_usage_history, read_token_turns, run_grok, run_grok_stream, set_hide_on_close, set_notify_target,
    trust_folder, watch_workspace, workspace_mtime, write_allowed_text, write_config_text, write_hook_file,
    stat_attachment,
};

pub(crate) const MAX_FS_BYTES: usize = 2 * 1024 * 1024;
pub(crate) const CONFIG_TEXT_MAX: usize = 512 * 1024;

const ALLOWED_CLI_PATCH_KEYS: &[&str] = &[
    "model",
    "effort",
    "permissionMode",
    "yolo",
    "showThinking",
    "telemetry",
    "memory",
    "compactPercent",
    "mcp",
];

#[derive(Debug, thiserror::Error)]
pub(crate) enum AppError {
    #[error("{0}")]
    Message(String),
}

impl Serialize for AppError {
    fn serialize<S: serde::Serializer>(&self, serializer: S) -> Result<S::Ok, S::Error> {
        serializer.serialize_str(&self.to_string())
    }
}

pub(crate) type AppResult<T> = Result<T, AppError>;

struct AgentSession {
    child: Child,
    tx: mpsc::Sender<String>,
    #[allow(dead_code)]
    generation: u64,
    #[allow(dead_code)]
    agent_id: AgentId,
}

pub(crate) struct AppState {
    next_id: AtomicU64,
    generation: AtomicU64,
    children: Mutex<AgentPool<AgentSession>>,
    workspace: Mutex<Option<PathBuf>>,
    workspaces: Mutex<HashMap<String, PathBuf>>,
    pub(crate) hide_on_close: Mutex<bool>,
    pub(crate) notify_target: Mutex<Option<String>>,
    pub(crate) config_write: Mutex<()>,
}

impl Default for AppState {
    fn default() -> Self {
        Self {
            next_id: AtomicU64::new(1),
            generation: AtomicU64::new(1),
            children: Mutex::new(AgentPool::new()),
            workspace: Mutex::new(None),
            workspaces: Mutex::new(HashMap::new()),
            hide_on_close: Mutex::new(true),
            notify_target: Mutex::new(None),
            config_write: Mutex::new(()),
        }
    }
}

#[derive(Debug, Serialize, Deserialize, Clone)]
#[serde(rename_all = "camelCase")]
struct SessionSummary {
    id: String,
    #[serde(default = "default_grok_agent")]
    agent_id: String,
    cwd: String,
    title: String,
    model: Option<String>,
    agent_name: Option<String>,
    updated_at: String,
    created_at: String,
    num_messages: u64,
    dir: Option<String>,
    session_kind: Option<String>,
    parent_session_id: Option<String>,
}

fn default_grok_agent() -> String { "grok".into() }

#[derive(Debug, Serialize)]
#[serde(rename_all = "camelCase")]
struct DoctorInfo {
    grok_path: Option<String>,
    grok_version: Option<String>,
    grok_home: String,
    auth_present: bool,
}

pub(crate) fn grok_home() -> PathBuf {
    std::env::var("GROK_HOME")
        .map(PathBuf::from)
        .unwrap_or_else(|_| dirs_home().join(".grok"))
}

pub(crate) fn grok_asset_root() -> PathBuf {
    grok_home().join("sessions")
}

#[cfg(test)]
mod grok_asset_tests {
    use super::*;

    #[test]
    fn grok_asset_root_is_sessions_not_whole_grok_home() {
        let root = grok_asset_root();
        assert_eq!(root.file_name().unwrap(), "sessions");
        assert_eq!(root, grok_home().join("sessions"));
        assert_ne!(root, grok_home());
    }
}

pub(crate) fn dirs_home() -> PathBuf {
    std::env::var("HOME")
        .map(PathBuf::from)
        .unwrap_or_else(|_| PathBuf::from("/"))
}

pub(crate) fn resolve_grok() -> Option<PathBuf> {
    if let Ok(explicit) = std::env::var("GROK_BIN") {
        let p = PathBuf::from(explicit);
        if p.is_file() {
            return Some(p);
        }
    }
    let home_bin = grok_home().join("bin").join("grok");
    if home_bin.is_file() {
        return Some(home_bin);
    }
    if let Ok(path) = std::env::var("PATH") {
        for dir in path.split(':') {
            let candidate = Path::new(dir).join("grok");
            if candidate.is_file() {
                return Some(candidate);
            }
        }
    }
    None
}

pub(crate) fn is_blocked_path(path: &Path) -> bool {
    let denied = [
        dirs_home().join(".ssh"),
        dirs_home().join(".gnupg"),
        grok_home().join("auth.json"),
    ];
    denied.iter().any(|d| path.starts_with(d) || path == d)
}

#[derive(Clone, Copy)]
pub(crate) enum PathAccess {
    Read,
    Write,
}

fn has_parent_traversal(path: &Path) -> bool {
    path.components().any(|component| matches!(component, std::path::Component::ParentDir))
}

fn resolve_with_existing_ancestor(requested: &Path) -> Result<PathBuf, String> {
    let mut ancestor = requested;
    let mut suffix = Vec::new();
    while !ancestor.exists() {
        let name = ancestor.file_name().ok_or_else(|| "path has no existing ancestor".to_string())?;
        suffix.push(name.to_os_string());
        ancestor = ancestor.parent().ok_or_else(|| "path has no existing ancestor".to_string())?;
    }
    let mut resolved = ancestor.canonicalize().map_err(|e| e.to_string())?;
    for component in suffix.iter().rev() {
        resolved.push(component);
    }
    Ok(resolved)
}

fn same_dir(a: &Path, b: &Path) -> bool {
    if a == b {
        return true;
    }
    #[cfg(unix)]
    {
        use std::os::unix::fs::MetadataExt;
        if let (Ok(ma), Ok(mb)) = (std::fs::metadata(a), std::fs::metadata(b)) {
            return ma.dev() == mb.dev() && ma.ino() == mb.ino();
        }
    }
    false
}

pub(crate) fn trusted_workspace_for_hint(workspace: Option<&Path>, hint: Option<&str>) -> Result<PathBuf, String> {
    let root = workspace.ok_or_else(|| "trusted workspace is not set".to_string())?.canonicalize().map_err(|e| e.to_string())?;
    if root == Path::new("/") || is_blocked_path(&root) { return Err("trusted workspace is invalid".into()); }
    if let Some(raw) = hint.filter(|value| !value.trim().is_empty()) {
        let hinted = PathBuf::from(raw).canonicalize().map_err(|e| e.to_string())?;
        if hinted == Path::new("/") || is_blocked_path(&hinted) {
            return Err("caller workspace does not match trusted workspace".into());
        }
        if let Ok(home) = dirs_home().canonicalize() {
            if hinted == home {
                return Err("caller workspace does not match trusted workspace".into());
            }
        }
        // Same folder (including macOS firmlink aliases), a worktree inside the
        // trusted root, or a parent git root while the trusted path is a session
        // worktree. Never expand the returned capability past `root`.
        if !(same_dir(&hinted, &root) || is_under(&hinted, &root) || is_under(&root, &hinted)) {
            return Err("caller workspace does not match trusted workspace".into());
        }
    }
    Ok(root)
}

pub(crate) fn trusted_desktop_root(workspace: Option<&Path>, hint: Option<&str>) -> Result<Option<PathBuf>, String> {
    let hint = hint.map(str::trim).filter(|value| !value.is_empty());
    if workspace.is_none() && hint.is_none() {
        return Ok(None);
    }
    trusted_workspace_for_hint(workspace, hint).map(Some)
}

pub(crate) fn resolve_allowed_path(raw: &str, workspace: Option<&Path>, access: PathAccess) -> Result<PathBuf, String> {
    if raw.is_empty() { return Err("empty path".into()); }
    let requested = PathBuf::from(raw);
    if !requested.is_absolute() { return Err("path must be absolute".into()); }
    if has_parent_traversal(&requested) { return Err("parent traversal is not allowed".into()); }
    let canon = match access {
        PathAccess::Read => requested.canonicalize().map_err(|e| e.to_string())?,
        PathAccess::Write => resolve_with_existing_ancestor(&requested)?,
    };
    if is_blocked_path(&canon) { return Err("path is blocked".into()); }
    if matches!(access, PathAccess::Write) {
        let root = workspace.ok_or_else(|| "trusted workspace is not set".to_string())?.canonicalize().map_err(|e| e.to_string())?;
        if root == Path::new("/") || is_blocked_path(&root) {
            return Err("trusted workspace is invalid".into());
        }
        if !canon.starts_with(&root) { return Err("path is outside the workspace".into()); }
        return Ok(canon);
    }
    if let Some(root) = workspace {
        let root = root.canonicalize().map_err(|e| e.to_string())?;
        if !canon.starts_with(&root) { return Err("path is outside the workspace".into()); }
    } else {
        let home = grok_home().canonicalize().map_err(|e| e.to_string())?;
        if !is_under(&canon, &home) { return Err("trusted workspace is not set".into()); }
    }
    Ok(canon)
}

async fn stop_one(state: &AppState, id: AgentId) {
    if let Some(mut session) = state.children.lock().await.remove(id) {
        let _ = session.child.start_kill();
        let _ = tokio::time::timeout(std::time::Duration::from_secs(2), session.child.wait()).await;
    }
}

async fn stop_agent_inner(state: &AppState) {
    let sessions = state.children.lock().await.drain();
    for (_, mut session) in sessions {
        let _ = session.child.start_kill();
        let _ = tokio::time::timeout(std::time::Duration::from_secs(2), session.child.wait()).await;
    }
}

#[tauri::command]
async fn doctor() -> DoctorInfo {
    let grok_path = resolve_grok();
    let grok_version = if let Some(path) = &grok_path {
        Command::new(path)
            .arg("--version")
            .output()
            .await
            .ok()
            .and_then(|o| String::from_utf8(o.stdout).ok())
            .map(|s| s.trim().to_string())
    } else {
        None
    };
    let home = grok_home();
    DoctorInfo {
        grok_path: grok_path.map(|p| p.display().to_string()),
        grok_version,
        grok_home: home.display().to_string(),
        auth_present: home.join("auth.json").is_file(),
    }
}

fn env_nonempty(name: &str) -> bool {
    std::env::var(name).ok().map(|s| !s.trim().is_empty()).unwrap_or(false)
}

#[tauri::command]
async fn doctor_all() -> Vec<crate::agent_doctor::AgentDoctorDto> {
    let home = dirs_home();
    let grok_h = grok_home();
    let grok_sub = grok_h.join("auth.json").is_file();
    let grok_key = env_nonempty("XAI_API_KEY") || env_nonempty("GROK_API_KEY");
    let kimi_h = home.join(".kimi-code");
    let claude_json = home.join(".claude.json");
    let codex_h = home.join(".codex");
    vec![
        crate::agent_doctor::doctor_from_evidence("grok", grok_h.display().to_string(), grok_sub, grok_key, None, false),
        crate::agent_doctor::doctor_from_evidence("kimi", kimi_h.display().to_string(), kimi_h.join("auth.json").is_file(), env_nonempty("KIMI_API_KEY"), None, false),
        crate::agent_doctor::doctor_from_evidence("claude", home.join(".claude").display().to_string(), claude_json.is_file(), env_nonempty("ANTHROPIC_API_KEY"), None, false),
        crate::agent_doctor::doctor_from_evidence("codex", codex_h.display().to_string(), codex_h.join("auth.json").is_file(), env_nonempty("OPENAI_API_KEY") || env_nonempty("CODEX_API_KEY"), None, false),
    ]
}

#[tauri::command]
async fn set_workspace(
    app: AppHandle,
    state: State<'_, Arc<AppState>>,
    cwd: String,
    session_id: Option<String>,
) -> AppResult<()> {
    let path = PathBuf::from(cwd.trim())
        .canonicalize()
        .map_err(|_| AppError::Message("invalid workspace".into()))?;
    if path == Path::new("/") || is_blocked_path(&path) {
        return Err(AppError::Message("invalid workspace".into()));
    }
    if let Some(sid) = session_id.filter(|s| !s.is_empty()) {
        state.workspaces.lock().await.insert(sid, path.clone());
    }
    *state.workspace.lock().await = Some(path.clone());
    let _ = app.asset_protocol_scope().allow_directory(&path, true);
    Ok(())
}

#[tauri::command]
async fn start_agent(
    app: AppHandle,
    state: State<'_, Arc<AppState>>,
    agent_id: Option<String>,
) -> AppResult<Value> {
    let id = parse_agent_id_arg(agent_id.as_deref()).map_err(AppError::Message)?;
    stop_one(&state, id).await;

    let generation = state.generation.fetch_add(1, Ordering::Relaxed) + 1;
    let (tx, rx) = mpsc::channel::<String>(64);

    let grok_bin = if id == AgentId::Grok { resolve_grok() } else { None };
    let (cmd_path, args) = crate::adapters::spawn_argv(id, grok_bin.as_deref()).ok_or_else(|| {
        if id == AgentId::Grok {
            AppError::Message("找不到 grok。请先安装 Grok Build CLI（~/.grok/bin/grok）。".into())
        } else {
            AppError::Message(format!("无法解析 {} 的启动参数", id.as_str()))
        }
    })?;
    let mut cmd = Command::new(&cmd_path);
    cmd.args(&args)
        .stdin(Stdio::piped())
        .stdout(Stdio::piped())
        .stderr(Stdio::piped())
        .kill_on_drop(true)
        .env("HOME", dirs_home());
    if id == AgentId::Grok {
        let mut path = std::env::var("PATH").unwrap_or_default();
        let extra = grok_home().join("bin");
        if !path.split(':').any(|p| Path::new(p) == extra) {
            path = format!("{}:{path}", extra.display());
        }
        cmd.env("PATH", path);
        cmd.env("GROK_DISABLE_AUTOUPDATER", "1");
    }
    let mut child = cmd.spawn().map_err(|e| AppError::Message(format!("启动 {} agent 失败: {e}", id.as_str())))?;
    let grok_path = grok_bin;

    let stdout = child
        .stdout
        .take()
        .ok_or_else(|| AppError::Message("agent stdout missing".into()))?;
    let stderr = child
        .stderr
        .take()
        .ok_or_else(|| AppError::Message("agent stderr missing".into()))?;
    let stdin = child
        .stdin
        .take()
        .ok_or_else(|| AppError::Message("agent stdin missing".into()))?;

    spawn_reader(app, stdout, stderr, tx.clone(), generation, id);
    spawn_writer(stdin, rx);
    state.children.lock().await.insert(
        id,
        AgentSession {
            child,
            tx,
            generation,
            agent_id: id,
        },
    );

    let mut result = json!({
        "ok": true,
        "agentId": id.as_str(),
        "generation": generation,
    });
    if let Some(grok) = grok_path {
        result["grok"] = json!(grok.display().to_string());
    }
    Ok(result)
}

#[tauri::command]
async fn stop_agent(
    state: State<'_, Arc<AppState>>,
    agent_id: Option<String>,
) -> AppResult<()> {
    if agent_id.is_none() {
        stop_agent_inner(&state).await;
    } else {
        let id = parse_agent_id_arg(agent_id.as_deref()).map_err(AppError::Message)?;
        stop_one(&state, id).await;
    }
    Ok(())
}

#[tauri::command]
async fn send_raw(
    state: State<'_, Arc<AppState>>,
    payload: Value,
    agent_id: Option<String>,
) -> AppResult<()> {
    let id = parse_agent_id_arg(agent_id.as_deref()).map_err(AppError::Message)?;
    let caps = caps_for_agent(id);
    if !rpc_payload_allowed_for(&payload, &caps) {
        return Err(AppError::Message("不允许的 RPC 方法".into()));
    }
    let line = serde_json::to_string(&payload).map_err(|e| AppError::Message(e.to_string()))?;
    let guard = state.children.lock().await;
    let session = guard
        .get(id)
        .ok_or_else(|| AppError::Message("agent 未启动".into()))?;
    session
        .tx
        .try_send(line)
        .map_err(|_| AppError::Message("agent stdin 繁忙或已关闭".into()))?;
    Ok(())
}

#[tauri::command]
async fn next_rpc_id(state: State<'_, Arc<AppState>>) -> AppResult<u64> {
    Ok(state.next_id.fetch_add(1, Ordering::Relaxed))
}

fn normalize_cwd(cwd: &str) -> String {
    cwd.trim_end_matches('/').to_string()
}

fn default_inbox_cwd() -> PathBuf {
    dirs_home().join("Documents").join("Agent Chats")
}

pub(crate) fn find_session_dir(session_id: &str) -> Option<PathBuf> {
    let roots = crate::session_lookup::session_roots(&dirs_home(), &grok_home());
    crate::session_lookup::find_session_dir_in(session_id, &roots).map(|(_, p)| p)
}

fn encode_cwd(cwd: &str) -> String {
    let mut out = String::new();
    for &b in cwd.as_bytes() {
        match b {
            b'A'..=b'Z' | b'a'..=b'z' | b'0'..=b'9' | b'-' | b'_' | b'.' | b'~' => {
                out.push(b as char);
            }
            _ => out.push_str(&format!("%{b:02X}")),
        }
    }
    out
}

fn parse_summary(path: &Path) -> Option<SessionSummary> {
    let text = std::fs::read_to_string(path).ok()?;
    let value: Value = serde_json::from_str(&text).ok()?;
    let info = value.get("info").cloned().unwrap_or(json!({}));
    let id = info.get("id").and_then(|v| v.as_str())?.to_string();
    if id.is_empty() {
        return None;
    }
    Some(SessionSummary {
        id,
        agent_id: "grok".into(),
        cwd: info
            .get("cwd")
            .and_then(|v| v.as_str())
            .unwrap_or("")
            .to_string(),
        title: value
            .get("generated_title")
            .and_then(|v| v.as_str())
            .or_else(|| value.get("session_summary").and_then(|v| v.as_str()))
            .filter(|s| !s.is_empty())
            .unwrap_or("未命名会话")
            .to_string(),
        model: value
            .get("current_model_id")
            .and_then(|v| v.as_str())
            .map(str::to_string),
        agent_name: value
            .get("agent_name")
            .and_then(|v| v.as_str())
            .map(str::to_string),
        updated_at: value
            .get("updated_at")
            .or_else(|| value.get("last_active_at"))
            .and_then(|v| v.as_str())
            .unwrap_or("")
            .to_string(),
        created_at: value
            .get("created_at")
            .and_then(|v| v.as_str())
            .unwrap_or("")
            .to_string(),
        num_messages: value
            .get("num_chat_messages")
            .or_else(|| value.get("num_messages"))
            .and_then(|v| v.as_u64())
            .unwrap_or(0),
        dir: path.parent().map(|p| p.to_string_lossy().into_owned()),
        session_kind: value
            .get("session_kind")
            .and_then(|v| v.as_str())
            .map(str::to_string),
        parent_session_id: value
            .get("parent_session_id")
            .and_then(|v| v.as_str())
            .map(str::to_string),
    })
}

fn attach_subagent_parents(summaries: &mut [SessionSummary]) {
    let mut child_to_parent: HashMap<String, String> = HashMap::new();
    for s in summaries.iter() {
        let Some(dir) = s.dir.as_ref() else { continue };
        let sub = Path::new(dir).join("subagents");
        let Ok(rd) = std::fs::read_dir(&sub) else { continue };
        for ent in rd.flatten() {
            let meta = ent.path().join("meta.json");
            let Ok(text) = std::fs::read_to_string(&meta) else { continue };
            let Ok(v) = serde_json::from_str::<Value>(&text) else { continue };
            let child = v
                .get("child_session_id")
                .or_else(|| v.get("subagent_id"))
                .and_then(|x| x.as_str());
            let parent = v.get("parent_session_id").and_then(|x| x.as_str());
            if let (Some(child), Some(parent)) = (child, parent) {
                child_to_parent.insert(child.to_string(), parent.to_string());
            }
        }
    }
    for s in summaries.iter_mut() {
        if s.parent_session_id.is_none() {
            if let Some(p) = child_to_parent.get(&s.id) {
                s.parent_session_id = Some(p.clone());
            }
        }
        if s.session_kind.is_none() && child_to_parent.contains_key(&s.id) {
            s.session_kind = Some("subagent".into());
        }
    }
}

struct SessionsDirCache {
    mtime: u64,
    sessions: Vec<SessionSummary>,
}

static SESSIONS_DIR_CACHE: OnceLock<std::sync::Mutex<Option<SessionsDirCache>>> = OnceLock::new();
static LAST_WEBUI_TEXT: OnceLock<std::sync::Mutex<Option<String>>> = OnceLock::new();

fn scan_all_sessions() -> Vec<SessionSummary> {
    let root = grok_home().join("sessions");
    if !root.is_dir() {
        return vec![];
    }
    let mut out = Vec::new();
    for entry in WalkDir::new(&root).max_depth(3).into_iter().flatten() {
        if entry.file_name() != "summary.json" {
            continue;
        }
        if let Some(row) = parse_summary(entry.path()) {
            out.push(row);
        }
    }
    attach_subagent_parents(&mut out);
    out.sort_by(|a, b| b.updated_at.cmp(&a.updated_at));
    out
}

fn cached_sessions() -> Vec<SessionSummary> {
    let root = grok_home().join("sessions");
    let mtime = cli_bridge::dir_mtime_ms(&root);
    let cache = SESSIONS_DIR_CACHE.get_or_init(|| std::sync::Mutex::new(None));
    let mut guard = cache.lock().unwrap_or_else(|e| e.into_inner());
    if cli_bridge::cache_hit(guard.as_ref().map(|row| row.mtime), mtime) {
        return guard.as_ref().map(|row| row.sessions.clone()).unwrap_or_default();
    }
    let sessions = scan_all_sessions();
    *guard = Some(SessionsDirCache {
        mtime,
        sessions: sessions.clone(),
    });
    sessions
}

#[tauri::command]
async fn list_sessions(cwd: Option<String>) -> AppResult<Vec<SessionSummary>> {
    tokio::task::spawn_blocking(move || {
        let mut out = cached_sessions();
        let home = dirs_home();
        let extra = [
            crate::session_scan::scan_named_subdirs(&home.join(".kimi-code").join("sessions"), "kimi"),
            crate::session_scan::scan_named_subdirs(&home.join(".claude").join("projects"), "claude"),
            crate::session_scan::scan_named_subdirs(&home.join(".codex").join("sessions"), "codex"),
        ];
        for batch in extra {
            for row in batch {
                out.push(SessionSummary {
                    id: row.id,
                    agent_id: row.agent_id,
                    cwd: String::new(),
                    title: row.title,
                    model: None,
                    agent_name: None,
                    updated_at: row.updated_at,
                    created_at: String::new(),
                    num_messages: 0,
                    dir: Some(row.dir),
                    session_kind: None,
                    parent_session_id: None,
                });
            }
        }
        out.sort_by(|a, b| b.updated_at.cmp(&a.updated_at));
        if let Some(want) = cwd.as_deref().filter(|s| !s.is_empty()) {
            out.retain(|row| row.cwd == want);
        }
        Ok(out)
    })
    .await
    .map_err(|e| AppError::Message(e.to_string()))?
}

#[derive(Debug, Serialize)]
struct SessionUsage {
    used: u64,
    size: u64,
}

#[tauri::command]
async fn read_session_usage(session_id: String) -> AppResult<Option<SessionUsage>> {
    tokio::task::spawn_blocking(move || {
        let Some(dir) = find_session_dir(&session_id) else {
            return Ok(None);
        };
        let path = dir.join("signals.json");
        if !path.is_file() {
            return Ok(None);
        }
        let value: Value = match std::fs::read_to_string(&path) {
            Ok(text) => match serde_json::from_str(&text) {
                Ok(v) => v,
                Err(_) => return Ok(None),
            },
            Err(_) => return Ok(None),
        };
        let used = value
            .get("contextTokensUsed")
            .and_then(|v| v.as_u64())
            .or_else(|| {
                value
                    .get("contextWindowUsage")
                    .and_then(|v| v.as_u64())
                    .and_then(|pct| {
                        value
                            .get("contextWindowTokens")
                            .and_then(|s| s.as_u64())
                            .map(|size| size.saturating_mul(pct) / 100)
                    })
            });
        let size = value.get("contextWindowTokens").and_then(|v| v.as_u64());
        match (used, size) {
            (Some(used), Some(size)) if size > 0 => Ok(Some(SessionUsage { used, size })),
            _ => Ok(None),
        }
    })
    .await
    .map_err(|e| AppError::Message(e.to_string()))?
}

const SESSION_UPDATES_TAIL_MAX: u64 = 4 * 1024 * 1024;

#[derive(Debug, Serialize)]
#[serde(rename_all = "camelCase")]
struct SessionUpdates {
    rows: Vec<Value>,
    next_byte: u64,
    truncated: bool,
}

fn empty_session_updates() -> SessionUpdates {
    SessionUpdates {
        rows: vec![],
        next_byte: 0,
        truncated: false,
    }
}

fn parse_update_line(line: &str) -> Option<Value> {
    let value = serde_json::from_str::<Value>(line.trim_end()).ok()?;
    // Records store `timestamp` in seconds, but very large values are already ms.
    let ts_ms = value
        .get("timestamp")
        .and_then(|v| v.as_f64())
        .map(|ts| if ts > 100_000_000_000.0 { ts } else { ts * 1000.0 })
        .map(|ms| ms as u64);
    let mut params = value.get("params").cloned().unwrap_or(value);
    if let (Some(ms), Some(obj)) = (ts_ms, params.as_object_mut()) {
        obj.insert("_ts".into(), json!(ms));
    }
    let kind = params
        .get("update")
        .and_then(|u| u.get("sessionUpdate"))
        .and_then(|v| v.as_str())
        .unwrap_or("");
    if matches!(
        kind,
        "user_message_chunk"
            | "agent_message_chunk"
            | "agent_thought_chunk"
            | "tool_call"
            | "tool_call_update"
            | "plan"
            | "usage_update"
            | "auto_compact_started"
            | "auto_compact_completed"
            | "turn_completed"
    ) {
        Some(params)
    } else {
        None
    }
}

fn read_updates_jsonl(path: &Path, after_byte: Option<u64>) -> AppResult<SessionUpdates> {
    read_updates_jsonl_limited(path, after_byte, SESSION_UPDATES_TAIL_MAX)
}

fn read_updates_jsonl_limited(
    path: &Path,
    after_byte: Option<u64>,
    tail_max: u64,
) -> AppResult<SessionUpdates> {
    use std::io::{BufRead, BufReader, Read, Seek, SeekFrom};
    let io = |e: std::io::Error| AppError::Message(e.to_string());
    let mut file = std::fs::File::open(path).map_err(io)?;
    let file_len = file.metadata().map_err(io)?.len();
    let (start, truncated) = match after_byte {
        Some(n) if n > 0 => (n.min(file_len), false),
        _ if file_len > tail_max => (file_len.saturating_sub(tail_max), true),
        _ => (0, false),
    };
    file.seek(SeekFrom::Start(start)).map_err(io)?;
    let mut pos = start;
    if truncated && start > 0 {
        let aligned = {
            file.seek(SeekFrom::Start(start - 1)).map_err(io)?;
            let mut prev = [0u8; 1];
            file.read_exact(&mut prev).map_err(io)?;
            prev[0] == b'\n'
        };
        if !aligned {
            loop {
                let mut b = [0u8; 1];
                let n = file.read(&mut b).map_err(io)?;
                if n == 0 {
                    break;
                }
                pos += 1;
                if b[0] == b'\n' {
                    break;
                }
            }
        }
    }
    let mut reader = BufReader::new(file);
    let mut buf = Vec::new();
    let mut rows = Vec::new();
    loop {
        buf.clear();
        let n = reader.read_until(b'\n', &mut buf).map_err(io)?;
        if n == 0 {
            break;
        }
        if buf.last() != Some(&b'\n') {
            break;
        }
        pos += n as u64;
        let Ok(line) = std::str::from_utf8(&buf) else {
            continue;
        };
        if let Some(row) = parse_update_line(line) {
            rows.push(row);
        }
    }
    Ok(SessionUpdates {
        rows,
        next_byte: pos,
        truncated,
    })
}

#[tauri::command]
async fn read_session_updates(
    session_id: String,
    after_byte: Option<u64>,
) -> AppResult<SessionUpdates> {
    tokio::task::spawn_blocking(move || {
        let Some(dir) = find_session_dir(&session_id) else {
            return Ok(empty_session_updates());
        };
        let path = dir.join("updates.jsonl");
        if !path.is_file() {
            return Ok(empty_session_updates());
        }
        read_updates_jsonl(&path, after_byte)
    })
    .await
    .map_err(|e| AppError::Message(e.to_string()))?
}

const PLAN_MAX_BYTES: usize = 256 * 1024;

#[derive(Debug, Serialize)]
#[serde(rename_all = "camelCase")]
struct PlanFile {
    path: String,
    text: String,
    mtime: u64,
}

#[tauri::command]
async fn read_plan(session_id: String) -> AppResult<Option<PlanFile>> {
    tokio::task::spawn_blocking(move || {
        let Some(dir) = find_session_dir(&session_id) else {
            return Ok(None);
        };
        let path = dir.join("plan.md");
        if !path.is_file() {
            return Ok(None);
        }
        let mut buf = std::fs::read(&path).map_err(|e| AppError::Message(e.to_string()))?;
        if buf.len() > PLAN_MAX_BYTES {
            buf.truncate(PLAN_MAX_BYTES);
        }
        let mtime = std::fs::metadata(&path)
            .and_then(|m| m.modified())
            .ok()
            .and_then(|t| t.duration_since(std::time::UNIX_EPOCH).ok())
            .map(|d| d.as_millis() as u64)
            .unwrap_or(0);
        Ok(Some(PlanFile {
            path: path.to_string_lossy().into_owned(),
            text: String::from_utf8_lossy(&buf).into_owned(),
            mtime,
        }))
    })
    .await
    .map_err(|e| AppError::Message(e.to_string()))?
}

#[tauri::command]
async fn pick_directory(app: AppHandle) -> AppResult<Option<String>> {
    use tauri_plugin_dialog::DialogExt;
    let (tx, rx) = tokio::sync::oneshot::channel();
    app.dialog().file().pick_folder(move |folder| {
        let path = folder.map(|p| p.to_string());
        let _ = tx.send(path);
    });
    Ok(rx.await.unwrap_or(None))
}

fn workbench_home() -> PathBuf {
    crate::agents_paths::workbench_home_from(
        &dirs_home(),
        std::env::var("ACP_WORKBENCH_HOME").ok().as_deref(),
    )
}
fn webui_path() -> PathBuf {
    crate::agents_paths::workbench_json_path(&workbench_home())
}

#[tauri::command]
async fn load_webui_state() -> AppResult<Value> {
    let registry = crate::agent_registry::agents_toml_path(&workbench_home());
    if crate::agent_registry::should_write_default_registry(registry.is_file()) {
        let _ = tokio::fs::create_dir_all(workbench_home()).await;
        let _ = tokio::fs::write(&registry, crate::agent_registry::default_agents_toml()).await;
    }
    let path = webui_path();
    let legacy = crate::agents_paths::grok_webui_path(&grok_home());
    if crate::workbench_state::should_copy_webui(path.is_file(), legacy.is_file()) {
        let text = tokio::fs::read_to_string(&legacy).await.map_err(|e| AppError::Message(e.to_string()))?;
        let raw: Value = serde_json::from_str(&text).map_err(|e| AppError::Message(e.to_string()))?;
        let migrated = crate::workbench_state::migrate_workbench_doc(raw);
        if let Some(parent) = path.parent() {
            let _ = tokio::fs::create_dir_all(parent).await;
        }
        let out = serde_json::to_string_pretty(&migrated).map_err(|e| AppError::Message(e.to_string()))?;
        tokio::fs::write(&path, out).await.map_err(|e| AppError::Message(e.to_string()))?;
        return Ok(migrated);
    }
    if !path.is_file() {
        return Ok(json!({ "projects": [], "theme": "light", "model": "", "showThinking": true }));
    }
    let text = tokio::fs::read_to_string(path).await.map_err(|e| AppError::Message(e.to_string()))?;
    serde_json::from_str(&text).map_err(|e| AppError::Message(e.to_string()))
}

#[tauri::command]
async fn install_marketplace_skill(source: String) -> AppResult<String> {
    let src = PathBuf::from(source);
    let home = dirs_home();
    let agents = crate::agents_paths::agents_home_from(&home, std::env::var("ACP_AGENTS_HOME").ok().as_deref());
    tokio::task::spawn_blocking(move || crate::marketplace::install_marketplace_skill_inner(&src, &agents))
        .await
        .map_err(|e| AppError::Message(e.to_string()))?
        .map_err(AppError::Message)
}

#[tauri::command]
async fn sync_agent_skill(name: String, enabled: Vec<(String, bool)>) -> AppResult<Vec<(String, String)>> {
    let home = dirs_home();
    let agents = crate::agents_paths::agents_home_from(&home, std::env::var("ACP_AGENTS_HOME").ok().as_deref());
    let canonical = agents.join("skills").join(&name);
    let flags: Vec<(String, bool)> = enabled;
    tokio::task::spawn_blocking(move || {
        let pairs: Vec<(&str, bool)> = flags.iter().map(|(a, e)| (a.as_str(), *e)).collect();
        let rows = crate::skill_sync::sync_skill_to_agents(&canonical, &home, &name, &pairs);
        Ok(rows.into_iter().map(|(a, r)| {
            (a, match r { Ok(s) => s.to_string(), Err(e) => e })
        }).collect())
    }).await.map_err(|e| AppError::Message(e.to_string()))?
}

#[tauri::command]
async fn import_agents_mcp_first_open() -> AppResult<Vec<String>> {
    let home = dirs_home();
    let agents = crate::agents_paths::agents_home_from(&home, std::env::var("ACP_AGENTS_HOME").ok().as_deref());
    let mcp_path = agents.join("mcp.json");
    let claude = home.join(".claude.json");
    let kimi = home.join(".kimi-code").join("mcp.json");
    tokio::task::spawn_blocking(move || {
        let canon = std::fs::read_to_string(&mcp_path).unwrap_or_default();
        let live_c = std::fs::read_to_string(&claude).unwrap_or_default();
        let live_k = std::fs::read_to_string(&kimi).unwrap_or_default();
        let (out, conflicts) = crate::mcp_import::apply_first_open_file(&canon, &[&live_c, &live_k]);
        if let Some(p) = mcp_path.parent() { let _ = std::fs::create_dir_all(p); }
        std::fs::write(&mcp_path, out).map_err(|e| AppError::Message(e.to_string()))?;
        Ok(conflicts)
    }).await.map_err(|e| AppError::Message(e.to_string()))?
}

#[tauri::command]
async fn read_agents_file(kind: String) -> AppResult<String> {
    let home = dirs_home();
    let agents = crate::agents_paths::agents_home_from(&home, std::env::var("ACP_AGENTS_HOME").ok().as_deref());
    let path = crate::agents_files::agents_file_path(&home, &agents, &kind)
        .ok_or_else(|| AppError::Message(format!("unknown agents file kind: {kind}")))?;
    tokio::task::spawn_blocking(move || Ok(crate::agents_files::read_agents_file_text(&path)))
        .await
        .map_err(|e| AppError::Message(e.to_string()))?
}

#[tauri::command]
async fn write_agents_file(kind: String, text: String) -> AppResult<()> {
    let home = dirs_home();
    let agents = crate::agents_paths::agents_home_from(&home, std::env::var("ACP_AGENTS_HOME").ok().as_deref());
    let path = crate::agents_files::agents_file_path(&home, &agents, &kind)
        .ok_or_else(|| AppError::Message(format!("unknown agents file kind: {kind}")))?;
    tokio::task::spawn_blocking(move || {
        crate::agents_files::write_agents_file_text(&path, &text).map_err(AppError::Message)
    })
    .await
    .map_err(|e| AppError::Message(e.to_string()))?
}

#[tauri::command]
async fn upsert_toml_mcp(kind: String, name: String, command: String, args: Vec<String>) -> AppResult<()> {
    if kind != "grok-toml" && kind != "codex-toml" {
        return Err(AppError::Message("unknown toml kind".into()));
    }
    let home = dirs_home();
    let agents = crate::agents_paths::agents_home_from(&home, std::env::var("ACP_AGENTS_HOME").ok().as_deref());
    let path = crate::agents_files::agents_file_path(&home, &agents, &kind)
        .ok_or_else(|| AppError::Message("unknown kind".into()))?;
    tokio::task::spawn_blocking(move || {
        let text = crate::agents_files::read_agents_file_text(&path);
        let next = crate::mcp_toml::upsert_mcp_servers_toml(&text, &name, &command, &args);
        crate::agents_files::write_agents_file_text(&path, &next).map_err(AppError::Message)
    })
    .await
    .map_err(|e| AppError::Message(e.to_string()))?
}

#[tauri::command]
async fn remove_toml_mcp(kind: String, name: String) -> AppResult<()> {
    if kind != "grok-toml" && kind != "codex-toml" {
        return Err(AppError::Message("unknown toml kind".into()));
    }
    let home = dirs_home();
    let agents = crate::agents_paths::agents_home_from(&home, std::env::var("ACP_AGENTS_HOME").ok().as_deref());
    let path = crate::agents_files::agents_file_path(&home, &agents, &kind)
        .ok_or_else(|| AppError::Message("unknown kind".into()))?;
    tokio::task::spawn_blocking(move || {
        let text = crate::agents_files::read_agents_file_text(&path);
        let next = crate::mcp_toml::remove_mcp_servers_toml(&text, &name);
        crate::agents_files::write_agents_file_text(&path, &next).map_err(AppError::Message)
    })
    .await
    .map_err(|e| AppError::Message(e.to_string()))?
}

#[tauri::command]
async fn save_webui_state(state: Value) -> AppResult<()> {
    let text = serde_json::to_string_pretty(&state).map_err(|e| AppError::Message(e.to_string()))?;
    {
        let cache = LAST_WEBUI_TEXT.get_or_init(|| std::sync::Mutex::new(None));
        let last = cache.lock().unwrap_or_else(|e| e.into_inner());
        if cli_bridge::should_skip_save(last.as_deref(), &text) {
            return Ok(());
        }
    }
    let path = webui_path();
    if let Some(parent) = path.parent() {
        let _ = tokio::fs::create_dir_all(parent).await;
    }
    tokio::fs::write(&path, &text)
        .await
        .map_err(|e| AppError::Message(e.to_string()))?;
    let cache = LAST_WEBUI_TEXT.get_or_init(|| std::sync::Mutex::new(None));
    *cache.lock().unwrap_or_else(|e| e.into_inner()) = Some(text);
    Ok(())
}

#[tauri::command]
async fn list_project_roots() -> AppResult<Vec<String>> {
    tokio::task::spawn_blocking(|| {
        let mut set = std::collections::BTreeSet::new();
        for row in cached_sessions() {
            if !row.cwd.is_empty() {
                set.insert(row.cwd);
            }
        }
        Ok(set.into_iter().collect())
    })
    .await
    .map_err(|e| AppError::Message(e.to_string()))?
}

#[tauri::command]
async fn delete_session(session_id: String) -> AppResult<()> {
    tokio::task::spawn_blocking(move || {
        let roots = crate::session_lookup::session_roots(&dirs_home(), &grok_home());
        match crate::session_lookup::find_session_dir_in(&session_id, &roots) {
            Some((_, path)) => {
                std::fs::remove_dir_all(path).map_err(|e| AppError::Message(e.to_string()))
            }
            None => Err(AppError::Message("session not found".into())),
        }
    })
    .await
    .map_err(|e| AppError::Message(e.to_string()))?
}

#[tauri::command]
async fn ensure_inbox(path: Option<String>) -> AppResult<String> {
    let dir = path
        .as_deref()
        .map(str::trim)
        .filter(|s| !s.is_empty())
        .map(PathBuf::from)
        .unwrap_or_else(default_inbox_cwd);
    if dir == PathBuf::from("/") || dir == grok_home() {
        return Err(AppError::Message("请选择具体目录，不要选系统根目录".into()));
    }
    tokio::fs::create_dir_all(&dir)
        .await
        .map_err(|e| AppError::Message(e.to_string()))?;
    Ok(normalize_cwd(&dir.to_string_lossy()))
}

#[tauri::command]
async fn move_session_to_cwd(session_id: String, dest_cwd: String, inbox_cwd: String) -> AppResult<SessionSummary> {
    tokio::task::spawn_blocking(move || {
        let dest = normalize_cwd(&dest_cwd);
        let inbox = normalize_cwd(&inbox_cwd);
        if dest.is_empty() {
            return Err(AppError::Message("没有目标项目".into()));
        }
        if dest == inbox {
            return Err(AppError::Message("目标不能是收件箱".into()));
        }
        let src_dir = find_session_dir(&session_id).ok_or_else(|| AppError::Message("session not found".into()))?;
        let summary_path = src_dir.join("summary.json");
        let text = std::fs::read_to_string(&summary_path).map_err(|e| AppError::Message(e.to_string()))?;
        let mut value: Value = serde_json::from_str(&text).map_err(|e| AppError::Message(e.to_string()))?;
        let current = value
            .get("info")
            .and_then(|i| i.get("cwd"))
            .and_then(|v| v.as_str())
            .unwrap_or("")
            .to_string();
        if normalize_cwd(&current) != inbox {
            return Err(AppError::Message("只能把独立对话移入项目".into()));
        }
        let dest_group = grok_home().join("sessions").join(encode_cwd(&dest));
        std::fs::create_dir_all(&dest_group).map_err(|e| AppError::Message(e.to_string()))?;
        let dest_dir = dest_group.join(&session_id);
        if dest_dir.exists() {
            return Err(AppError::Message("目标项目已有同 id 会话".into()));
        }
        if let Some(info) = value.get_mut("info").and_then(|v| v.as_object_mut()) {
            info.insert("cwd".into(), json!(dest));
        } else {
            value["info"] = json!({ "id": session_id, "cwd": dest });
        }
        let next_text = serde_json::to_string_pretty(&value).map_err(|e| AppError::Message(e.to_string()))?;
        std::fs::rename(&src_dir, &dest_dir).map_err(|e| AppError::Message(e.to_string()))?;
        if let Err(e) = std::fs::write(dest_dir.join("summary.json"), next_text) {
            let _ = std::fs::rename(&dest_dir, &src_dir);
            return Err(AppError::Message(e.to_string()));
        }
        parse_summary(&dest_dir.join("summary.json")).ok_or_else(|| AppError::Message("搬家后无法读取会话".into()))
    })
    .await
    .map_err(|e| AppError::Message(e.to_string()))?
}

#[tauri::command]
async fn inspect_brief(
    state: State<'_, Arc<AppState>>,
    cwd: Option<String>,
) -> AppResult<Value> {
    let grok = resolve_grok().ok_or_else(|| AppError::Message("找不到 grok".into()))?;
    let mut cmd = Command::new(grok);
    cmd.args(["inspect", "--json"]);
    let dir = cwd
        .as_deref()
        .filter(|s| !s.is_empty())
        .map(PathBuf::from)
        .or(state.workspace.lock().await.clone());
    if let Some(dir) = dir {
        if dir.is_dir() {
            cmd.current_dir(dir);
        }
    }
    let output = cmd
        .output()
        .await
        .map_err(|e| AppError::Message(e.to_string()))?;
    let parsed: Value = serde_json::from_slice(&output.stdout).unwrap_or(json!({}));
    Ok(parsed)
}

#[tauri::command]
async fn list_project_files(cwd: String, query: Option<String>) -> AppResult<Vec<String>> {
    tokio::task::spawn_blocking(move || {
        let root = PathBuf::from(cwd);
        if !root.is_dir() || root == PathBuf::from("/") || root == dirs_home() {
            return Ok(vec![]);
        }
        let q = query.unwrap_or_default().to_lowercase();
        let mut files = Vec::new();
        for entry in WalkDir::new(&root)
            .max_depth(4)
            .into_iter()
            .filter_entry(|e| {
                let name = e.file_name().to_string_lossy();
                !matches!(
                    name.as_ref(),
                    "node_modules" | ".git" | "target" | "dist" | ".next" | "__pycache__"
                )
            })
            .flatten()
        {
            if !entry.file_type().is_file() {
                continue;
            }
            let rel = entry
                .path()
                .strip_prefix(&root)
                .unwrap_or(entry.path())
                .to_string_lossy()
                .to_string();
            if q.is_empty() || rel.to_lowercase().contains(&q) {
                files.push(rel);
            }
            if files.len() >= 80 {
                break;
            }
        }
        files.sort();
        Ok(files)
    })
    .await
    .map_err(|e| AppError::Message(e.to_string()))?
}

#[derive(Debug, Serialize)]
#[serde(rename_all = "camelCase")]
struct WorkspaceEntry {
    name: String,
    path: String,
    kind: String,
}

#[tauri::command]
async fn list_workspace_entries(cwd: String) -> AppResult<Vec<WorkspaceEntry>> {
    tokio::task::spawn_blocking(move || {
        if cwd.is_empty() {
            return Ok(vec![]);
        }
        let root = PathBuf::from(&cwd);
        let Ok(canon) = root.canonicalize() else {
            return Ok(vec![]);
        };
        if !canon.is_dir() || canon == PathBuf::from("/") || canon == dirs_home() {
            return Ok(vec![]);
        }
        if let Ok(home) = dirs_home().canonicalize() {
            if canon == home {
                return Ok(vec![]);
            }
        }
        let mut dirs = Vec::new();
        let mut files = Vec::new();
        let Ok(rd) = std::fs::read_dir(&canon) else {
            return Ok(vec![]);
        };
        for ent in rd.flatten() {
            let name = ent.file_name().to_string_lossy().into_owned();
            if matches!(
                name.as_str(),
                "node_modules"
                    | ".git"
                    | "target"
                    | "dist"
                    | ".next"
                    | "__pycache__"
                    | ".DS_Store"
            ) {
                continue;
            }
            let path = ent.path();
            let abs = path.to_string_lossy().into_owned();
            let is_dir = ent.file_type().map(|t| t.is_dir()).unwrap_or(false);
            let row = WorkspaceEntry {
                name,
                path: abs,
                kind: if is_dir {
                    "dir".into()
                } else {
                    "file".into()
                },
            };
            if is_dir {
                dirs.push(row);
            } else {
                files.push(row);
            }
        }
        dirs.sort_by(|a, b| a.name.to_lowercase().cmp(&b.name.to_lowercase()));
        files.sort_by(|a, b| a.name.to_lowercase().cmp(&b.name.to_lowercase()));
        let mut out = dirs;
        out.append(&mut files);
        out.truncate(40);
        Ok(out)
    })
    .await
    .map_err(|e| AppError::Message(e.to_string()))?
}

pub(crate) fn is_under(child: &Path, parent: &Path) -> bool {
    if child == parent || child.starts_with(parent) || same_dir(child, parent) {
        return true;
    }
    let mut cursor = child;
    while let Some(next) = cursor.parent() {
        if same_dir(next, parent) {
            return true;
        }
        cursor = next;
    }
    false
}

fn git_dir_ancestor(dir: &Path) -> Option<PathBuf> {
    let mut cursor = dir;
    loop {
        if cursor.join(".git").exists() {
            return Some(cursor.to_path_buf());
        }
        match cursor.parent() {
            Some(parent) if parent != cursor && parent != Path::new("/") => cursor = parent,
            _ => return None,
        }
    }
}

fn is_transient_path(canon: &Path) -> bool {
    let temp = std::env::temp_dir();
    if is_under(canon, &temp) {
        return true;
    }
    ["/tmp", "/private/tmp", "/var/folders", "/private/var/folders"]
        .iter()
        .any(|root| is_under(canon, Path::new(root)))
}

fn allow_text_read_candidate(canon: &Path, allow_root: Option<&Path>, is_file: bool) -> bool {
    if !is_file {
        return false;
    }
    if is_blocked_path(canon) {
        return false;
    }
    if canon == Path::new("/") {
        return false;
    }
    if let Ok(home) = dirs_home().canonicalize() {
        if canon == home {
            return false;
        }
    }
    if let Ok(home) = grok_home().canonicalize() {
        if is_under(canon, &home) {
            return true;
        }
    }
    let Some(root) = allow_root else {
        return false;
    };
    if is_under(canon, root) {
        return true;
    }
    if let Some(git) = git_dir_ancestor(root) {
        if is_under(canon, &git) {
            return true;
        }
    }
    if is_transient_path(canon) {
        return true;
    }
    if let Ok(home) = dirs_home().canonicalize() {
        if is_under(canon, &home) {
            return true;
        }
    }
    false
}

fn allow_text_read(canon: &Path, allow_root: Option<&Path>) -> bool {
    allow_text_read_candidate(canon, allow_root, canon.is_file())
}

const PREVIEW_MAX_BYTES: usize = 256 * 1024;

#[derive(Debug, Serialize)]
#[serde(rename_all = "camelCase")]
struct TextFilePreview {
    path: String,
    text: String,
    truncated: bool,
}

#[tauri::command]
async fn read_text_file(
    state: State<'_, Arc<AppState>>,
    path: String,
    allow_root: Option<String>,
) -> AppResult<TextFilePreview> {
    let workspace = state.workspace.lock().await.clone();
    tokio::task::spawn_blocking(move || {
        let trimmed = path.trim();
        if trimmed.is_empty() || trimmed.starts_with('-') {
            return Err(AppError::Message("invalid path".into()));
        }
        let raw = PathBuf::from(trimmed);
        let canon = raw
            .canonicalize()
            .map_err(|_| AppError::Message("file not found".into()))?;
        let allow = trusted_desktop_root(workspace.as_deref(), allow_root.as_deref())
            .map_err(AppError::Message)?;
        if !allow_text_read(&canon, allow.as_deref()) {
            return Err(AppError::Message("无法预览这个文件".into()));
        }
        let meta = std::fs::metadata(&canon).map_err(|e| AppError::Message(e.to_string()))?;
        if !meta.is_file() {
            return Err(AppError::Message("not a file".into()));
        }
        let mut buf = std::fs::read(&canon).map_err(|e| AppError::Message(e.to_string()))?;
        if buf.iter().take(4096).any(|b| *b == 0) {
            return Err(AppError::Message("binary file".into()));
        }
        let truncated = buf.len() > PREVIEW_MAX_BYTES;
        if truncated {
            buf.truncate(PREVIEW_MAX_BYTES);
        }
        Ok(TextFilePreview {
            path: canon.to_string_lossy().into_owned(),
            text: String::from_utf8_lossy(&buf).into_owned(),
            truncated,
        })
    })
    .await
    .map_err(|e| AppError::Message(e.to_string()))?
}

/// Grok reads project rules from these names, in this order, in every directory it scans.
const RULE_FILENAMES: [&str; 6] = [
    "Agents.md",
    "Claude.md",
    "CLAUDE.md",
    "CLAUDE.local.md",
    "AGENT.md",
    "AGENTS.md",
];
const RULE_MAX_BYTES: u64 = 1024 * 1024;
const RULE_MAX_LEVELS: usize = 12;
const RULE_MAX_ENTRIES: usize = 20;

#[derive(Debug, Serialize)]
#[serde(rename_all = "camelCase")]
struct RuleFile {
    path: String,
    name: String,
    dir: String,
    scope: String,
    bytes: u64,
}

fn rule_scope(dir: &Path, cwd: &Path, home: &Path) -> &'static str {
    // Home first: a project under $HOME must not classify ~/.claude as "parent".
    if dir == home
        || is_under(dir, &home.join(".claude"))
        || is_under(dir, &home.join(".cursor"))
    {
        "home"
    } else if dir == cwd || is_under(dir, cwd) {
        // `<cwd>/.claude/CLAUDE.md` lives in a subdirectory, but it is still
        // a project rule, not a parent-directory one.
        "project"
    } else {
        "parent"
    }
}

fn push_rule_file(
    out: &mut Vec<RuleFile>,
    seen: &mut std::collections::HashSet<PathBuf>,
    candidate: PathBuf,
    cwd: &Path,
    home: &Path,
) {
    // Canonical paths also collapse `Agents.md` and `AGENTS.md` on case-insensitive volumes.
    let Ok(canon) = candidate.canonicalize() else {
        return;
    };
    if is_blocked_path(&canon) {
        return;
    }
    let Ok(meta) = std::fs::metadata(&canon) else {
        return;
    };
    if !meta.is_file() || meta.len() > RULE_MAX_BYTES {
        return;
    }
    let (Some(name), Some(parent)) = (canon.file_name(), canon.parent()) else {
        return;
    };
    if !seen.insert(canon.clone()) {
        return;
    }
    out.push(RuleFile {
        name: name.to_string_lossy().into_owned(),
        dir: parent.to_string_lossy().into_owned(),
        scope: rule_scope(parent, cwd, home).into(),
        bytes: meta.len(),
        path: canon.to_string_lossy().into_owned(),
    });
}

#[tauri::command]
async fn list_project_rules(cwd: String) -> AppResult<Vec<RuleFile>> {
    tokio::task::spawn_blocking(move || {
        let trimmed = cwd.trim();
        if trimmed.is_empty() || trimmed == "/" {
            return Ok(vec![]);
        }
        let Ok(root) = PathBuf::from(trimmed).canonicalize() else {
            return Ok(vec![]);
        };
        let home = dirs_home().canonicalize().unwrap_or_else(|_| dirs_home());
        if root == Path::new("/") || root == home {
            return Ok(vec![]);
        }

        let mut out = Vec::new();
        let mut seen = std::collections::HashSet::new();
        let mut dir = root.clone();
        for _ in 0..RULE_MAX_LEVELS {
            for name in RULE_FILENAMES {
                push_rule_file(&mut out, &mut seen, dir.join(name), &root, &home);
            }
            for name in ["CLAUDE.md", "CLAUDE.local.md"] {
                push_rule_file(
                    &mut out,
                    &mut seen,
                    dir.join(".claude").join(name),
                    &root,
                    &home,
                );
            }
            if dir == home || dir == Path::new("/") {
                break;
            }
            let Some(parent) = dir.parent() else { break };
            dir = parent.to_path_buf();
        }
        for base in [home.join(".claude"), home.join(".cursor")] {
            for name in RULE_FILENAMES {
                push_rule_file(&mut out, &mut seen, base.join(name), &root, &home);
            }
        }
        out.truncate(RULE_MAX_ENTRIES);
        Ok(out)
    })
    .await
    .map_err(|e| AppError::Message(e.to_string()))?
}

#[derive(Debug, Serialize)]
#[serde(rename_all = "camelCase")]
struct MemoryChangeRow {
    path: String,
    mtime: u64,
}

#[tauri::command]
async fn list_memory_changes() -> AppResult<Vec<MemoryChangeRow>> {
    tokio::task::spawn_blocking(move || {
        let root = grok_home().join("memory");
        if !root.is_dir() {
            return Ok(vec![]);
        }
        let mut out = Vec::new();
        for entry in WalkDir::new(&root)
            .max_depth(5)
            .into_iter()
            .filter_entry(|e| e.file_name() != ".git")
            .flatten()
        {
            if !entry.file_type().is_file() {
                continue;
            }
            let Ok(meta) = entry.metadata() else { continue };
            let mtime = meta
                .modified()
                .ok()
                .and_then(|t| t.duration_since(std::time::UNIX_EPOCH).ok())
                .map(|d| d.as_millis() as u64)
                .unwrap_or(0);
            out.push(MemoryChangeRow {
                path: entry.path().to_string_lossy().into_owned(),
                mtime,
            });
        }
        out.sort_by(|a, b| b.mtime.cmp(&a.mtime));
        out.truncate(40);
        Ok(out)
    })
    .await
    .map_err(|e| AppError::Message(e.to_string()))?
}

#[derive(Debug, Serialize)]
#[serde(rename_all = "camelCase")]
struct SessionSearchHit {
    session_id: String,
    cwd: String,
    title: String,
    snippet: String,
}

fn collapse_whitespace(s: &str) -> String {
    s.split_whitespace().collect::<Vec<_>>().join(" ")
}

fn snippet_around(text: &str, query_lower: &str) -> Option<String> {
    let lower = text.to_lowercase();
    let idx = lower.find(query_lower)?;
    let match_end = idx + query_lower.len();
    let before = 30usize;
    let after = 50usize;
    let mut start = idx.saturating_sub(before);
    while start > 0 && !text.is_char_boundary(start) {
        start -= 1;
    }
    let mut end = (match_end + after).min(text.len());
    while end < text.len() && !text.is_char_boundary(end) {
        end += 1;
    }
    let collapsed = collapse_whitespace(&text[start..end]);
    if collapsed.is_empty() {
        None
    } else {
        Some(collapsed.chars().take(80).collect())
    }
}

#[tauri::command]
async fn search_session_text(
    query: String,
    cwd: Option<String>,
) -> AppResult<Vec<SessionSearchHit>> {
    tokio::task::spawn_blocking(move || {
        let q = query.trim();
        if q.chars().count() < 2 {
            return Ok(vec![]);
        }
        let q_lower = q.to_lowercase();
        let root = grok_home().join("sessions");
        if !root.is_dir() {
            return Ok(vec![]);
        }
        let mut scan_root = root.clone();
        if let Some(cwd) = cwd.as_deref().filter(|s| !s.is_empty()) {
            let encoded = encode_cwd(cwd);
            let direct = root.join(&encoded);
            if direct.is_dir() {
                scan_root = direct;
            } else {
                return Ok(vec![]);
            }
        }
        let mut out = Vec::new();
        for entry in WalkDir::new(&scan_root).max_depth(3).into_iter().flatten() {
            if entry.file_name() != "summary.json" {
                continue;
            }
            let Some(row) = parse_summary(entry.path()) else {
                continue;
            };
            if let Some(want) = cwd.as_deref().filter(|s| !s.is_empty()) {
                if row.cwd != want {
                    continue;
                }
            }
            let title_match = row.title.to_lowercase().contains(&q_lower);
            let mut snippet = if title_match {
                snippet_around(&row.title, &q_lower)
                    .or_else(|| Some(collapse_whitespace(&row.title).chars().take(80).collect()))
            } else {
                None
            };
            if snippet.is_none() {
                let updates_path = entry
                    .path()
                    .parent()
                    .map(|p| p.join("updates.jsonl"));
                if let Some(path) = updates_path {
                    if path.is_file() {
                        if let Ok(mut f) = std::fs::File::open(&path) {
                            use std::io::Read;
                            let mut buf = vec![0u8; 256 * 1024];
                            let n = f.read(&mut buf).unwrap_or(0);
                            buf.truncate(n);
                            let text = String::from_utf8_lossy(&buf);
                            snippet = snippet_around(&text, &q_lower);
                        }
                    }
                }
            }
            let Some(snippet) = snippet else {
                continue;
            };
            out.push(SessionSearchHit {
                session_id: row.id,
                cwd: row.cwd,
                title: row.title,
                snippet,
            });
            if out.len() >= 20 {
                break;
            }
        }
        Ok(out)
    })
    .await
    .map_err(|e| AppError::Message(e.to_string()))?
}

/// True when `explorer` would treat `target` as a switch (`/select`, `/e`) rather than a path.
fn explorer_slash_switch(target: &str) -> bool {
    let t = target.trim();
    if t.starts_with("//") {
        return false;
    }
    let Some(rest) = t.strip_prefix('/') else {
        return false;
    };
    rest.as_bytes().get(1) != Some(&b':')
}

fn open_path_arg_rejected(trimmed: &str) -> bool {
    if trimmed.is_empty() || trimmed.starts_with('-') {
        return true;
    }
    cfg!(target_os = "windows") && explorer_slash_switch(trimmed)
}

#[tauri::command]
fn path_is_dir(path: String) -> bool {
    let trimmed = path.trim();
    if trimmed.is_empty() || trimmed.starts_with('-') {
        return false;
    }
    std::path::Path::new(trimmed).is_dir()
}

fn open_command(target: &Path) -> (&'static str, Vec<std::ffi::OsString>) {
    #[cfg(target_os = "macos")]
    { ("open", vec!["--".into(), target.as_os_str().to_owned()]) }
    #[cfg(target_os = "linux")]
    { ("xdg-open", vec![target.as_os_str().to_owned()]) }
    #[cfg(target_os = "windows")]
    { ("explorer", vec![target.as_os_str().to_owned()]) }
}

fn decode_file_url(raw: &str) -> String {
    let path = raw.strip_prefix("file://").unwrap_or(raw);
    let bytes = path.as_bytes();
    let mut out = Vec::with_capacity(bytes.len());
    let mut i = 0;
    while i < bytes.len() {
        if bytes[i] == b'%' && i + 2 < bytes.len() {
            if let Ok(hex) = std::str::from_utf8(&bytes[i + 1..i + 3]) {
                if let Ok(v) = u8::from_str_radix(hex, 16) {
                    out.push(v);
                    i += 3;
                    continue;
                }
            }
        }
        out.push(bytes[i]);
        i += 1;
    }
    String::from_utf8_lossy(&out).into_owned()
}

fn reject_symlink(path: &Path) -> AppResult<()> {
    let meta = std::fs::symlink_metadata(path).map_err(|_| AppError::Message("Review 目标不存在".into()))?;
    if meta.file_type().is_symlink() {
        return Err(AppError::Message("Review 目标不能是符号链接".into()));
    }
    Ok(())
}

fn confirm_unfollowed(path: &Path) -> AppResult<()> {
    reject_symlink(path)?;
    #[cfg(unix)]
    {
        use std::os::unix::fs::MetadataExt;
        let lstat = std::fs::symlink_metadata(path).map_err(|_| AppError::Message("Review 目标不存在".into()))?;
        let followed = std::fs::metadata(path).map_err(|_| AppError::Message("Review 目标不存在".into()))?;
        if lstat.dev() != followed.dev() || lstat.ino() != followed.ino() {
            return Err(AppError::Message("Review 目标不能是符号链接".into()));
        }
    }
    Ok(())
}

fn validate_review_open_target(path: &str, workspace: Option<&Path>, hint: &str) -> AppResult<PathBuf> {
    let trimmed = path.trim();
    if trimmed.is_empty() || trimmed.contains("://") || trimmed.starts_with('-') { return Err(AppError::Message("Review 目标不安全".into())); }
    let root = trusted_workspace_for_hint(workspace, Some(hint)).map_err(AppError::Message)?;
    let requested = PathBuf::from(trimmed);
    if has_parent_traversal(&requested) { return Err(AppError::Message("Review 目标不在当前工作区".into())); }
    let unfollowed = if requested.is_absolute() { requested } else { root.join(requested) };
    if is_blocked_path(&unfollowed) || !is_under(&unfollowed, &root) { return Err(AppError::Message("Review 目标不在当前工作区".into())); }
    confirm_unfollowed(&unfollowed)?;
    let target = unfollowed.canonicalize().map_err(|_| AppError::Message("Review 目标不存在".into()))?;
    if is_blocked_path(&target) || !is_under(&target, &root) { return Err(AppError::Message("Review 目标不在当前工作区".into())); }
    confirm_unfollowed(&unfollowed)?;
    let lower = unfollowed.to_string_lossy().to_lowercase();
    if lower.split('/').any(|part| part.ends_with(".app")) || matches!(unfollowed.extension().and_then(|v| v.to_str()).map(str::to_ascii_lowercase).as_deref(), Some("exe" | "com" | "bat" | "cmd" | "appimage" | "desktop")) { return Err(AppError::Message("Review 不允许打开应用或可执行文件".into())); }
    #[cfg(unix)]
    if std::fs::symlink_metadata(&unfollowed).map(|m| { use std::os::unix::fs::PermissionsExt; m.permissions().mode() & 0o111 != 0 }).unwrap_or(false) { return Err(AppError::Message("Review 不允许打开可执行文件".into())); }
    Ok(unfollowed)
}

#[tauri::command]
async fn open_review_path(state: State<'_, Arc<AppState>>, path: String, allow_root: String) -> AppResult<()> {
    let workspace = state.workspace.lock().await.clone();
    let target = validate_review_open_target(&path, workspace.as_deref(), &allow_root)?;
    let (program, args) = open_command(&target);
    let status = Command::new(program).args(args).status().await.map_err(|e| AppError::Message(e.to_string()))?;
    if !status.success() { return Err(AppError::Message(format!("open 失败: {}", target.display()))); }
    Ok(())
}

#[tauri::command]
async fn open_path(path: String) -> AppResult<()> {
    let trimmed = path.trim();
    if open_path_arg_rejected(trimmed) {
        return Err(AppError::Message("invalid path".into()));
    }
    let target = if trimmed.starts_with("file://") {
        decode_file_url(trimmed)
    } else if trimmed.starts_with("http://") || trimmed.starts_with("https://") {
        trimmed.to_string()
    } else if trimmed.contains("://") {
        return Err(AppError::Message("invalid path".into()));
    } else {
        trimmed.to_string()
    };
    if !target.starts_with("http://") && !target.starts_with("https://") && open_path_arg_rejected(&target) {
        return Err(AppError::Message("invalid path".into()));
    }
    let (program, args) = open_command(Path::new(&target));
    let status = Command::new(program).args(args)
        .status()
        .await
        .map_err(|e| AppError::Message(e.to_string()))?;
    if !status.success() {
        return Err(AppError::Message(format!("open 失败: {target}")));
    }
    crate::cli_bridge::append_desktop_audit("open_path", &target);
    Ok(())
}

pub(crate) fn config_path() -> PathBuf {
    grok_home().join("config.toml")
}

fn toml_bool(item: &toml_edit::Item) -> Option<bool> {
    item.as_bool().or_else(|| item.as_str().and_then(|s| match s {
        "true" | "True" => Some(true),
        "false" | "False" => Some(false),
        _ => None,
    }))
}

#[tauri::command]
async fn read_cli_settings() -> AppResult<Value> {
    tokio::task::spawn_blocking(|| {
        let path = config_path();
        let text = if path.is_file() {
            std::fs::read_to_string(&path).unwrap_or_default()
        } else {
            String::new()
        };
        let doc = text.parse::<toml_edit::DocumentMut>().unwrap_or_default();
        let model = doc
            .get("models")
            .and_then(|t| t.get("default"))
            .and_then(|v| v.as_str())
            .unwrap_or("grok-4.6")
            .to_string();
        let effort = doc
            .get("models")
            .and_then(|t| t.get("default_reasoning_effort"))
            .and_then(|v| v.as_str())
            .unwrap_or("high")
            .to_string();
        let permission = doc
            .get("ui")
            .and_then(|t| t.get("permission_mode"))
            .and_then(|v| v.as_str())
            .unwrap_or("ask")
            .to_string();
        let yolo = doc
            .get("ui")
            .and_then(|t| t.get("yolo"))
            .and_then(toml_bool)
            .unwrap_or(false);
        let thinking = doc
            .get("ui")
            .and_then(|t| t.get("show_thinking_blocks"))
            .and_then(toml_bool)
            .unwrap_or(true);
        let telemetry = doc
            .get("features")
            .and_then(|t| t.get("telemetry"))
            .and_then(toml_bool)
            .unwrap_or(false);
        let memory = doc
            .get("memory")
            .and_then(|t| t.get("enabled"))
            .and_then(toml_bool)
            .unwrap_or(true);
        let compact = doc
            .get("session")
            .and_then(|t| t.get("auto_compact_threshold_percent"))
            .and_then(|v| v.as_integer())
            .unwrap_or(85);
        let mut mcp = Vec::new();
        if let Some(tbl) = doc.get("mcp_servers").and_then(|i| i.as_table()) {
            for (name, item) in tbl.iter() {
                let enabled = item
                    .get("enabled")
                    .and_then(toml_bool)
                    .unwrap_or(true);
                mcp.push(json!({ "name": name, "enabled": enabled }));
            }
        }
        mcp.sort_by(|a, b| {
            a.get("name")
                .and_then(|v| v.as_str())
                .unwrap_or("")
                .cmp(b.get("name").and_then(|v| v.as_str()).unwrap_or(""))
        });
        Ok(json!({
            "model": model,
            "effort": effort,
            "permissionMode": permission,
            "yolo": yolo,
            "showThinking": thinking,
            "telemetry": telemetry,
            "memory": memory,
            "compactPercent": compact,
            "mcp": mcp,
            "configPath": path.display().to_string(),
        }))
    })
    .await
    .map_err(|e| AppError::Message(e.to_string()))?
}

pub(crate) fn ensure_table<'a>(doc: &'a mut toml_edit::DocumentMut, key: &str) -> &'a mut toml_edit::Table {
    if !doc.contains_key(key) {
        doc[key] = toml_edit::Item::Table(toml_edit::Table::new());
    }
    doc[key].as_table_mut().expect("table")
}

pub(crate) fn reject_oversized_config_text(text: &str) -> AppResult<()> {
    if text.len() > CONFIG_TEXT_MAX {
        return Err(AppError::Message("配置太大".into()));
    }
    Ok(())
}

pub(crate) fn apply_cli_patch(doc: &mut toml_edit::DocumentMut, patch: &Value) -> AppResult<()> {
    let obj = patch
        .as_object()
        .ok_or_else(|| AppError::Message("不支持的设置字段".into()))?;
    for key in obj.keys() {
        if !ALLOWED_CLI_PATCH_KEYS.contains(&key.as_str()) {
            return Err(AppError::Message("不支持的设置字段".into()));
        }
    }
    if let Some(v) = patch.get("model").and_then(|v| v.as_str()) {
        ensure_table(doc, "models")["default"] = toml_edit::value(v);
    }
    if let Some(v) = patch.get("effort").and_then(|v| v.as_str()) {
        ensure_table(doc, "models")["default_reasoning_effort"] = toml_edit::value(v);
    }
    if let Some(v) = patch.get("permissionMode").and_then(|v| v.as_str()) {
        ensure_table(doc, "ui")["permission_mode"] = toml_edit::value(v);
    }
    if let Some(v) = patch.get("yolo").and_then(|v| v.as_bool()) {
        ensure_table(doc, "ui")["yolo"] = toml_edit::value(v);
    }
    if let Some(v) = patch.get("showThinking").and_then(|v| v.as_bool()) {
        ensure_table(doc, "ui")["show_thinking_blocks"] = toml_edit::value(v);
    }
    if let Some(v) = patch.get("telemetry").and_then(|v| v.as_bool()) {
        ensure_table(doc, "features")["telemetry"] = toml_edit::value(v);
    }
    if let Some(v) = patch.get("memory").and_then(|v| v.as_bool()) {
        ensure_table(doc, "memory")["enabled"] = toml_edit::value(v);
    }
    if let Some(v) = patch.get("compactPercent").and_then(|v| v.as_i64()) {
        ensure_table(doc, "session")["auto_compact_threshold_percent"] =
            toml_edit::value(v.clamp(50, 95));
    }
    if let Some(arr) = patch.get("mcp").and_then(|v| v.as_array()) {
        for item in arr {
            let name = item.get("name").and_then(|v| v.as_str()).unwrap_or("");
            let enabled = item.get("enabled").and_then(|v| v.as_bool());
            if name.is_empty() || enabled.is_none() {
                continue;
            }
            if let Some(tbl) = doc["mcp_servers"].as_table_mut() {
                if let Some(server) = tbl.get_mut(name) {
                    if let Some(inner) = server.as_table_like_mut() {
                        inner.insert("enabled", toml_edit::value(enabled.unwrap()));
                    }
                }
            }
        }
    }
    Ok(())
}

#[tauri::command]
async fn patch_cli_settings(state: State<'_, Arc<AppState>>, patch: Value) -> AppResult<Value> {
    let _guard = state.config_write.lock().await;
    tokio::task::spawn_blocking(move || {
        let path = config_path();
        let text = if path.is_file() {
            std::fs::read_to_string(&path).unwrap_or_default()
        } else {
            String::new()
        };
        reject_oversized_config_text(&text)?;
        let mut doc = text.parse::<toml_edit::DocumentMut>().unwrap_or_default();
        apply_cli_patch(&mut doc, &patch)?;
        let out = doc.to_string();
        reject_oversized_config_text(&out)?;
        if let Some(parent) = path.parent() {
            let _ = std::fs::create_dir_all(parent);
        }
        std::fs::write(&path, out).map_err(|e| AppError::Message(e.to_string()))?;
        Ok(json!({ "ok": true }))
    })
    .await
    .map_err(|e| AppError::Message(e.to_string()))?
}

const GIT_TIMEOUT_SECS: u64 = 5;
const GIT_WORKTREE_TIMEOUT_SECS: u64 = 60;
const UNTRACKED_MAX_BYTES: u64 = 1024 * 1024;
const GIT_CHANGES_MAX: usize = 200;

#[derive(Debug, Serialize)]
#[serde(rename_all = "camelCase")]
struct GitStatus {
    is_repo: bool,
    root: String,
    branch: String,
    dirty: u32,
    ahead: u32,
    behind: u32,
}

impl GitStatus {
    fn not_repo() -> Self {
        Self {
            is_repo: false,
            root: String::new(),
            branch: String::new(),
            dirty: 0,
            ahead: 0,
            behind: 0,
        }
    }
}

#[derive(Debug, Serialize)]
#[serde(rename_all = "camelCase")]
struct GitChange {
    path: String,
    abs: String,
    added: u32,
    removed: u32,
    status: String,
}

fn is_noise_path(rel: &str) -> bool {
    Path::new(rel).components().any(|c| {
        matches!(
            c.as_os_str().to_string_lossy().as_ref(),
            "node_modules" | ".git" | "target" | "dist" | ".next" | "__pycache__"
        )
    })
}

async fn git_output(dir: &Path, args: &[&str], secs: u64) -> Option<std::process::Output> {
    let run = Command::new("git").arg("-C").arg(dir).args(args).output();
    match tokio::time::timeout(std::time::Duration::from_secs(secs), run).await {
        Ok(Ok(out)) => Some(out),
        _ => None,
    }
}

/// Runs git and yields stdout only when the command exits successfully within the timeout.
pub(crate) async fn git_stdout(dir: &Path, args: &[&str]) -> Option<String> {
    let out = git_output(dir, args, GIT_TIMEOUT_SECS).await?;
    if !out.status.success() {
        return None;
    }
    Some(String::from_utf8_lossy(&out.stdout).into_owned())
}

/// Rejects the paths where "the whole machine" would be treated as a project.
pub(crate) fn guard_repo_cwd(cwd: &str) -> Option<PathBuf> {
    let trimmed = cwd.trim();
    if trimmed.is_empty() {
        return None;
    }
    let canon = PathBuf::from(trimmed).canonicalize().ok()?;
    if canon == Path::new("/") || canon == dirs_home() {
        return None;
    }
    if let Ok(home) = dirs_home().canonicalize() {
        if canon == home {
            return None;
        }
    }
    Some(canon)
}

pub(crate) async fn git_repo_root(cwd: &str) -> Option<PathBuf> {
    let dir = guard_repo_cwd(cwd)?;
    let out = git_stdout(&dir, &["rev-parse", "--show-toplevel"]).await?;
    let root = out.trim();
    if root.is_empty() {
        None
    } else {
        PathBuf::from(root).canonicalize().ok().or_else(|| Some(PathBuf::from(root)))
    }
}

#[tauri::command]
async fn git_status(cwd: String) -> AppResult<GitStatus> {
    let Some(root) = git_repo_root(&cwd).await else {
        return Ok(GitStatus::not_repo());
    };
    let branch = git_stdout(&root, &["rev-parse", "--abbrev-ref", "HEAD"])
        .await
        .map(|s| s.trim().to_string())
        .unwrap_or_default();
    let dirty = git_stdout(&root, &["status", "--porcelain"])
        .await
        .map(|s| s.lines().filter(|l| !l.trim().is_empty()).count() as u32)
        .unwrap_or(0);
    let (behind, ahead) = git_stdout(
        &root,
        &["rev-list", "--left-right", "--count", "@{upstream}...HEAD"],
    )
    .await
    .and_then(|s| {
        let mut parts = s.split_whitespace();
        let behind = parts.next()?.parse::<u32>().ok()?;
        let ahead = parts.next()?.parse::<u32>().ok()?;
        Some((behind, ahead))
    })
    .unwrap_or((0, 0));
    Ok(GitStatus {
        is_repo: true,
        root: root.to_string_lossy().into_owned(),
        branch,
        dirty,
        ahead,
        behind,
    })
}

/// `git status --porcelain` quotes paths that contain unusual bytes.
fn unquote_porcelain_path(raw: &str) -> String {
    let trimmed = raw.trim();
    if trimmed.len() >= 2 && trimmed.starts_with('"') && trimmed.ends_with('"') {
        trimmed[1..trimmed.len() - 1].replace("\\\"", "\"")
    } else {
        trimmed.to_string()
    }
}

/// `--numstat` reports renames as `old => new` or `dir/{old => new}/file`; keep the new path.
fn numstat_path(raw: &str) -> String {
    if !raw.contains(" => ") {
        return raw.to_string();
    }
    match (raw.find('{'), raw.find('}')) {
        (Some(open), Some(close)) if open < close => {
            let inner = &raw[open + 1..close];
            let new = inner.rsplit(" => ").next().unwrap_or(inner);
            format!("{}{}{}", &raw[..open], new, &raw[close + 1..]).replace("//", "/")
        }
        _ => raw.rsplit(" => ").next().unwrap_or(raw).to_string(),
    }
}

fn porcelain_status(code: &str) -> &'static str {
    if code == "??" {
        "untracked"
    } else if code.contains('D') {
        "deleted"
    } else if code.contains('R') {
        "renamed"
    } else if code.contains('A') {
        "added"
    } else {
        "modified"
    }
}

fn untracked_added_lines(abs: &Path) -> u32 {
    let Ok(meta) = std::fs::metadata(abs) else {
        return 0;
    };
    if !meta.is_file() || meta.len() >= UNTRACKED_MAX_BYTES {
        return 0;
    }
    let Ok(buf) = std::fs::read(abs) else {
        return 0;
    };
    if buf.iter().take(4096).any(|b| *b == 0) {
        return 0;
    }
    String::from_utf8_lossy(&buf).lines().count() as u32
}

#[tauri::command]
async fn git_changes(cwd: String) -> AppResult<Vec<GitChange>> {
    let Some(root) = git_repo_root(&cwd).await else {
        return Ok(vec![]);
    };
    // Missing on a fresh repo without HEAD; the porcelain pass still reports the files.
    let numstat = git_stdout(&root, &["diff", "--numstat", "HEAD"])
        .await
        .unwrap_or_default();
    let porcelain = git_stdout(&root, &["status", "--porcelain"])
        .await
        .unwrap_or_default();

    tokio::task::spawn_blocking(move || {
        let mut rows: std::collections::BTreeMap<String, GitChange> =
            std::collections::BTreeMap::new();

        for line in numstat.lines() {
            let mut cols = line.splitn(3, '\t');
            let (Some(added), Some(removed), Some(rel)) =
                (cols.next(), cols.next(), cols.next())
            else {
                continue;
            };
            let rel = numstat_path(&unquote_porcelain_path(rel));
            if rel.is_empty() || is_noise_path(&rel) {
                continue;
            }
            rows.insert(
                rel.clone(),
                GitChange {
                    abs: root.join(&rel).to_string_lossy().into_owned(),
                    path: rel,
                    added: added.parse::<u32>().unwrap_or(0),
                    removed: removed.parse::<u32>().unwrap_or(0),
                    status: "modified".into(),
                },
            );
        }

        for line in porcelain.lines() {
            if line.len() < 4 {
                continue;
            }
            let code = &line[..2];
            let rest = &line[3..];
            // Renames are reported as "old -> new"; the new path is what the user sees.
            let rel = unquote_porcelain_path(rest.rsplit(" -> ").next().unwrap_or(rest));
            if rel.is_empty() || is_noise_path(&rel) {
                continue;
            }
            let status = porcelain_status(code);
            let abs = root.join(&rel);
            match rows.get_mut(&rel) {
                Some(row) => row.status = status.into(),
                None => {
                    let added = if status == "untracked" {
                        untracked_added_lines(&abs)
                    } else {
                        0
                    };
                    rows.insert(
                        rel.clone(),
                        GitChange {
                            abs: abs.to_string_lossy().into_owned(),
                            path: rel,
                            added,
                            removed: 0,
                            status: status.into(),
                        },
                    );
                }
            }
        }

        let mut out: Vec<GitChange> = rows.into_values().collect();
        out.truncate(GIT_CHANGES_MAX);
        Ok(out)
    })
    .await
    .map_err(|e| AppError::Message(e.to_string()))?
}

fn is_valid_worktree_name(name: &str) -> bool {
    let len = name.chars().count();
    if len == 0 || len > 40 {
        return false;
    }
    if name.starts_with('-') || name.starts_with('.') {
        return false;
    }
    name.chars()
        .all(|c| c.is_ascii_alphanumeric() || c == '.' || c == '_' || c == '-')
}

async fn ensure_worktrees_excluded(root: &Path) {
    let exclude = root.join(".git").join("info").join("exclude");
    let Ok(text) = tokio::fs::read_to_string(&exclude).await else {
        return;
    };
    if text.lines().any(|l| l.trim() == ".worktrees/") {
        return;
    }
    let mut next = text;
    if !next.is_empty() && !next.ends_with('\n') {
        next.push('\n');
    }
    next.push_str(".worktrees/\n");
    let _ = tokio::fs::write(&exclude, next).await;
}

#[tauri::command]
async fn git_create_worktree(cwd: String, name: String) -> AppResult<String> {
    let root = git_repo_root(&cwd)
        .await
        .ok_or_else(|| AppError::Message("当前目录不是 git 仓库".into()))?;
    let name = name.trim().to_string();
    if !is_valid_worktree_name(&name) {
        return Err(AppError::Message(
            "worktree 名称只能包含字母、数字、点、下划线和连字符".into(),
        ));
    }
    let target = root.join(".worktrees").join(&name);
    if target.exists() {
        return Err(AppError::Message("同名 worktree 已存在".into()));
    }
    let target_arg = target.to_string_lossy().into_owned();
    let branch = format!("grok/{name}");

    let timed_out = || AppError::Message("git worktree add 超时".into());
    let mut out = git_output(
        &root,
        &["worktree", "add", &target_arg, "-b", &branch],
        GIT_WORKTREE_TIMEOUT_SECS,
    )
    .await
    .ok_or_else(timed_out)?;
    if !out.status.success() && String::from_utf8_lossy(&out.stderr).contains("already exists") {
        out = git_output(
            &root,
            &["worktree", "add", &target_arg, &branch],
            GIT_WORKTREE_TIMEOUT_SECS,
        )
        .await
        .ok_or_else(timed_out)?;
    }
    if !out.status.success() {
        let stderr = String::from_utf8_lossy(&out.stderr).trim().to_string();
        return Err(AppError::Message(if stderr.is_empty() {
            "创建 worktree 失败".into()
        } else {
            stderr
        }));
    }

    ensure_worktrees_excluded(&root).await;
    Ok(target_arg)
}

/// Canonicalizes the closest existing ancestor so a missing file (or missing parent) can still be
/// restored without letting a symlinked component escape the allow root.
fn resolve_write_target(raw: &Path) -> Option<PathBuf> {
    let mut missing: Vec<&std::ffi::OsStr> = Vec::new();
    let mut cursor = raw;
    loop {
        if let Ok(canon) = cursor.canonicalize() {
            let mut resolved = canon;
            for part in missing.iter().rev() {
                resolved.push(part);
            }
            return Some(resolved);
        }
        let name = cursor.file_name()?;
        missing.push(name);
        cursor = cursor.parent()?;
    }
}

#[tauri::command]
async fn restore_text_file(
    state: State<'_, Arc<AppState>>,
    path: String,
    text: Option<String>,
    allow_root: String,
) -> AppResult<()> {
    let workspace = state.workspace.lock().await.clone();
    tokio::task::spawn_blocking(move || {
        let no_root = || AppError::Message("没有可写的项目根目录".into());
        let root = trusted_workspace_for_hint(workspace.as_deref(), Some(allow_root.trim())).map_err(|_| no_root())?;
        if root == Path::new("/") || root == dirs_home() {
            return Err(no_root());
        }
        if let Ok(home) = dirs_home().canonicalize() {
            if root == home {
                return Err(no_root());
            }
        }
        if let Ok(home) = grok_home().canonicalize() {
            if is_under(&root, &home) {
                return Err(no_root());
            }
        }

        let bad_path = || AppError::Message("路径不合法".into());
        let raw = PathBuf::from(path.trim());
        if !raw.is_absolute() || raw.file_name().is_none() {
            return Err(bad_path());
        }
        if raw
            .components()
            .any(|c| matches!(c, std::path::Component::ParentDir))
        {
            return Err(bad_path());
        }
        let resolved = resolve_write_target(&raw).ok_or_else(bad_path)?;
        if is_blocked_path(&resolved) {
            return Err(AppError::Message("路径不允许写入".into()));
        }
        if !is_under(&resolved, &root) {
            return Err(AppError::Message("路径不在项目目录内".into()));
        }

        match text {
            Some(content) => {
                if content.len() > MAX_FS_BYTES {
                    return Err(AppError::Message("内容超过 2MB，无法写入".into()));
                }
                if let Some(parent) = resolved.parent() {
                    std::fs::create_dir_all(parent)
                        .map_err(|e| AppError::Message(e.to_string()))?;
                }
                std::fs::write(&resolved, content).map_err(|e| AppError::Message(e.to_string()))?;
            }
            None => match std::fs::symlink_metadata(&resolved) {
                Ok(meta) if meta.is_dir() => {
                    return Err(AppError::Message("目标是目录，拒绝删除".into()));
                }
                Ok(_) => {
                    std::fs::remove_file(&resolved)
                        .map_err(|e| AppError::Message(e.to_string()))?;
                }
                Err(_) => {}
            },
        }
        Ok(())
    })
    .await
    .map_err(|e| AppError::Message(e.to_string()))?
}

#[tauri::command]
async fn set_tray_status(app: AppHandle, text: String) -> AppResult<()> {
    let Some(tray) = app.tray_by_id("main") else {
        return Ok(());
    };
    let result = if text.is_empty() {
        tray.set_title(None::<&str>)
    } else {
        tray.set_title(Some(&text))
    };
    result.map_err(|e| AppError::Message(e.to_string()))
}

fn focus_main_window(app: &AppHandle) {
    if let Some(window) = app.get_webview_window("main") {
        let _ = window.show();
        let _ = window.unminimize();
        let _ = window.set_focus();
    }
    if let Some(state) = app.try_state::<Arc<AppState>>() {
        if let Ok(mut slot) = state.notify_target.try_lock() {
            if let Some(sid) = slot.take() {
                let _ = app.emit("notify-open", sid);
            }
        }
    }
}

fn build_tray(app: &AppHandle) -> tauri::Result<()> {
    use tauri::menu::{Menu, MenuItem};
    use tauri::tray::{MouseButton, MouseButtonState, TrayIconBuilder, TrayIconEvent};

    let show = MenuItem::with_id(app, "show", "显示窗口", true, None::<&str>)?;
    let last = MenuItem::with_id(app, "last", "打开上次会话", true, None::<&str>)?;
    let quit = MenuItem::with_id(app, "quit", "退出", true, None::<&str>)?;
    let menu = Menu::with_items(app, &[&show, &last, &quit])?;

    let click_handle = app.clone();
    let mut builder = TrayIconBuilder::with_id("main")
        .menu(&menu)
        .show_menu_on_left_click(false)
        .on_menu_event(|app, event| match event.id.as_ref() {
            "show" => focus_main_window(app),
            "last" => {
                focus_main_window(app);
                let _ = app.emit("tray-open-last", ());
            }
            "quit" => app.exit(0),
            _ => {}
        })
        .on_tray_icon_event(move |_tray, event| {
            if let TrayIconEvent::Click {
                button: MouseButton::Left,
                button_state: MouseButtonState::Up,
                ..
            } = event
            {
                focus_main_window(&click_handle);
            }
        });
    if let Some(icon) = app.default_window_icon().cloned() {
        builder = builder.icon(icon);
    }
    builder.build(app)?;
    Ok(())
}

pub fn run() {
    tauri::Builder::default()
        .plugin(tauri_plugin_single_instance::init(|app, _argv, _cwd| {
            focus_main_window(app);
        }))
        .plugin(tauri_plugin_dialog::init())
        .plugin(tauri_plugin_notification::init())
        .setup(|app| {
            if let Err(e) = build_tray(&app.handle().clone()) {
                eprintln!("tray init failed: {e}");
            }
            let scope = app.asset_protocol_scope();
            let _ = scope.allow_directory(&grok_asset_root(), true);
            let _ = scope.allow_directory(&std::env::temp_dir(), true);
            if let Some(window) = app.get_webview_window("main") {
                let min = tauri::LogicalSize::new(1024.0, 720.0);
                let _ = window.set_min_size(Some(min));
                if let (Ok(size), Ok(scale)) = (window.inner_size(), window.scale_factor()) {
                    let logical = size.to_logical::<f64>(scale);
                    if logical.width < min.width || logical.height < min.height {
                        let _ = window.set_size(tauri::LogicalSize::new(
                            logical.width.max(min.width),
                            logical.height.max(min.height),
                        ));
                    }
                }
            }
            Ok(())
        })
        .on_window_event(|window, event| {
            if let tauri::WindowEvent::CloseRequested { api, .. } = event {
                if let Some(state) = window.try_state::<Arc<AppState>>() {
                    if let Ok(flag) = state.hide_on_close.try_lock() {
                        if *flag {
                            api.prevent_close();
                            let _ = window.hide();
                        }
                    }
                }
            }
        })
        .manage(Arc::new(AppState::default()))
        .invoke_handler(tauri::generate_handler![
            doctor,
            doctor_all,
            set_workspace,
            start_agent,
            stop_agent,
            send_raw,
            next_rpc_id,
            list_sessions,
            read_session_updates,
            read_session_usage,
            read_plan,
            list_project_rules,
            pick_directory,
            load_webui_state,
            save_webui_state,
            list_project_roots,
            delete_session,
            ensure_inbox,
            move_session_to_cwd,
            inspect_brief,
            read_cli_settings,
            patch_cli_settings,
            list_project_files,
            list_workspace_entries,
            search_session_text,
            read_text_file,
            list_memory_changes,
            open_path,
            path_is_dir,
            open_review_path,
            git_status,
            git_changes,
            git_create_worktree,
            restore_text_file,
            set_tray_status,
            run_grok,
            run_grok_stream,
            read_config_text,
            write_config_text,
            write_allowed_text,
            stat_attachment,
            git_log,
            git_branches,
            git_commit,
            git_blame,
            git_status_untracked,
            list_file_tree,
            hide_window,
            set_hide_on_close,
            read_models_cache,
            list_models_text,
            trust_folder,
            create_skill,
            import_agents_mcp_first_open,
            read_agents_file,
            write_agents_file,
            upsert_toml_mcp,
            remove_toml_mcp,
            sync_agent_skill,
            install_marketplace_skill,
            patch_skills_disabled,
            patch_compat,
            list_session_spills,
            list_imagine_artifacts,
            open_in_terminal,
            read_managed_config,
            set_notify_target,
            write_hook_file,
            list_agents_dir,
            watch_workspace,
            workspace_mtime,
            read_usage_history,
            read_token_turns
        ])
        .run(tauri::generate_context!())
        .expect("error while running tauri application");
}

#[cfg(test)]
mod final_review_tests {
    use super::*;

    fn acp_path_root() -> PathBuf {
        let root = std::env::temp_dir().join(format!("grok-acp-path-policy-{}-{:?}", std::process::id(), std::thread::current().id()));
        let _ = std::fs::remove_dir_all(&root);
        std::fs::create_dir_all(&root).unwrap();
        root.canonicalize().unwrap()
    }

    #[test]
    fn acp_path_resolver_allows_existing_reads_and_new_workspace_writes() {
        let root = acp_path_root();
        let existing = root.join("existing.txt");
        std::fs::write(&existing, "ok").unwrap();
        assert_eq!(resolve_allowed_path(existing.to_str().unwrap(), Some(&root), PathAccess::Read).unwrap(), existing);
        let new_file = root.join("nested").join("new.txt");
        std::fs::create_dir(root.join("nested")).unwrap();
        assert_eq!(resolve_allowed_path(new_file.to_str().unwrap(), Some(&root), PathAccess::Write).unwrap(), new_file);
        let _ = std::fs::remove_dir_all(root);
    }

    #[cfg(unix)]
    #[test]
    fn acp_path_resolver_rejects_new_write_through_symlinked_parent() {
        use std::os::unix::fs::symlink;
        let root = acp_path_root();
        let outside = root.parent().unwrap().join(format!("{}-outside", root.file_name().unwrap().to_string_lossy()));
        let _ = std::fs::remove_dir_all(&outside);
        std::fs::create_dir_all(&outside).unwrap();
        symlink(&outside, root.join("link")).unwrap();
        let escaped = root.join("link").join("new.txt");
        assert!(resolve_allowed_path(escaped.to_str().unwrap(), Some(&root), PathAccess::Write).is_err());
        let _ = std::fs::remove_dir_all(root);
        let _ = std::fs::remove_dir_all(outside);
    }

    #[test]
    fn acp_path_resolver_rejects_blocked_outside_and_parent_traversal_paths() {
        let root = acp_path_root();
        let blocked = dirs_home().join(".ssh").join("new-key");
        assert!(resolve_allowed_path(blocked.to_str().unwrap(), None, PathAccess::Write).is_err());
        let outside = root.parent().unwrap().join("outside.txt");
        assert!(resolve_allowed_path(outside.to_str().unwrap(), Some(&root), PathAccess::Write).is_err());
        let traversal = root.join("sub").join("..").join("new.txt");
        assert!(resolve_allowed_path(traversal.to_str().unwrap(), Some(&root), PathAccess::Write).is_err());
        let _ = std::fs::remove_dir_all(root);
    }


    #[test]
    fn text_preview_applies_sensitive_path_guard_before_allowances() {
        let home = dirs_home();
        let grok = grok_home();
        assert!(!allow_text_read_candidate(&grok.join("auth.json"), Some(&grok), true));
        assert!(!allow_text_read_candidate(&home.join(".ssh/id_ed25519"), Some(&home), true));
        assert!(!allow_text_read_candidate(&home.join(".gnupg/private-key"), Some(&home), true));
    }

    #[test]
    fn review_open_policy_rejects_urls_apps_executables_and_outside_paths() {
        let root = std::env::temp_dir().join(format!("grok-review-policy-{}", std::process::id()));
        let _ = std::fs::create_dir_all(&root);
        let root = root.canonicalize().unwrap();
        let archive = root.join("artifact.zip");
        std::fs::write(&archive, b"zip").unwrap();
        assert!(validate_review_open_target(archive.to_str().unwrap(), Some(&root), root.to_str().unwrap()).is_ok());
        assert!(validate_review_open_target("https://example.com/file.zip", Some(&root), root.to_str().unwrap()).is_err());
        assert!(validate_review_open_target(root.join("Bad.app").to_str().unwrap(), Some(&root), root.to_str().unwrap()).is_err());
        assert!(validate_review_open_target("/bin/sh", Some(&root), root.to_str().unwrap()).is_err());
        let _ = std::fs::remove_dir_all(root);
    }

    #[cfg(unix)]
    #[test]
    fn validate_review_open_target_rejects_symlink_to_file_outside_workspace() {
        use std::os::unix::fs::symlink;
        let root = std::env::temp_dir().join(format!("grok-review-symlink-{}", std::process::id()));
        let _ = std::fs::remove_dir_all(&root);
        std::fs::create_dir_all(&root).unwrap();
        let root = root.canonicalize().unwrap();
        let outside = root.parent().unwrap().join(format!("{}-outside.txt", root.file_name().unwrap().to_string_lossy()));
        std::fs::write(&outside, b"secret").unwrap();
        let link = root.join("escape.txt");
        symlink(&outside, &link).unwrap();
        let err = validate_review_open_target(link.to_str().unwrap(), Some(&root), root.to_str().unwrap()).unwrap_err();
        assert_eq!(err.to_string(), "Review 目标不能是符号链接");
        let _ = std::fs::remove_dir_all(&root);
        let _ = std::fs::remove_file(&outside);
    }

    #[test]
    fn text_preview_allows_workspace_files_but_rejects_canonical_escapes() {
        let root = Path::new("/workspace");
        assert!(allow_text_read_candidate(&root.join("src/main.rs"), Some(root), true));
        assert!(!allow_text_read_candidate(Path::new("/private/secret.txt"), Some(root), true));
    }

    #[test]
    fn text_preview_allows_cited_home_temp_and_git_ancestor_files() {
        let home = dirs_home().canonicalize().unwrap_or_else(|_| dirs_home());
        let tmp = std::env::temp_dir();
        let root = acp_path_root();
        let nested = root.join("apps").join("web");
        std::fs::create_dir_all(root.join(".git")).unwrap();
        std::fs::create_dir_all(&nested).unwrap();
        assert!(allow_text_read_candidate(&root.join("pkg/a.ts"), Some(&nested), true));
        assert!(allow_text_read_candidate(&home.join("Downloads/cover.md"), Some(&nested), true));
        assert!(allow_text_read_candidate(&tmp.join("shot.png"), Some(&nested), true));
        assert!(!allow_text_read_candidate(&home.join("Downloads/cover.md"), None, true));
        let _ = std::fs::remove_dir_all(root);
    }

    #[test]
    fn caller_root_must_match_the_trusted_workspace() {
        let root = acp_path_root();
        assert!(trusted_workspace_for_hint(Some(&root), Some(root.to_str().unwrap())).is_ok());
        assert!(trusted_workspace_for_hint(Some(&root), Some("/")).is_err());
        assert!(trusted_workspace_for_hint(None, Some(root.to_str().unwrap())).is_err());
        let _ = std::fs::remove_dir_all(root);
    }

    #[test]
    fn caller_hint_may_be_nested_in_or_a_parent_of_the_trusted_workspace() {
        let root = acp_path_root();
        let nested = root.join(".worktrees").join("session");
        std::fs::create_dir_all(&nested).unwrap();
        let sibling = root.parent().unwrap().join(format!("{}-sibling", root.file_name().unwrap().to_string_lossy()));
        let _ = std::fs::remove_dir_all(&sibling);
        std::fs::create_dir_all(&sibling).unwrap();

        let nested_hint = nested.to_str().unwrap();
        let root_hint = root.to_str().unwrap();
        assert_eq!(trusted_workspace_for_hint(Some(&root), Some(nested_hint)).unwrap(), root);
        assert_eq!(trusted_workspace_for_hint(Some(&nested), Some(root_hint)).unwrap(), nested.canonicalize().unwrap());
        assert!(trusted_workspace_for_hint(Some(&root), Some(sibling.to_str().unwrap())).is_err());

        let _ = std::fs::remove_dir_all(root);
        let _ = std::fs::remove_dir_all(sibling);
    }

    #[test]
    fn desktop_root_rejects_forged_slash_and_keeps_grok_home_without_workspace() {
        let root = acp_path_root();
        let hint = root.to_str().unwrap();
        assert_eq!(trusted_desktop_root(Some(&root), Some(hint)).unwrap().as_deref(), Some(root.as_path()));
        assert!(trusted_desktop_root(Some(&root), Some("/")).is_err());
        assert!(trusted_desktop_root(None, Some("/")).is_err());
        assert!(trusted_desktop_root(None, Some(hint)).is_err());
        assert_eq!(trusted_desktop_root(None, None).unwrap(), None);
        let grok = grok_home().join("config.toml");
        assert!(allow_text_read_candidate(&grok, None, true));
        assert!(!allow_text_read_candidate(&grok_home().join("auth.json"), None, true));
        assert!(!allow_text_read_candidate(&root.join("src/main.rs"), None, true));
        let _ = std::fs::remove_dir_all(root);
    }

    #[test]
    fn acp_write_requires_a_trusted_workspace() {
        let root = acp_path_root();
        let new_file = root.join("new.txt");
        assert!(resolve_allowed_path(new_file.to_str().unwrap(), None, PathAccess::Write).is_err());
        assert!(resolve_allowed_path(new_file.to_str().unwrap(), Some(&root), PathAccess::Write).is_ok());
        assert!(resolve_allowed_path(new_file.to_str().unwrap(), Some(Path::new("/")), PathAccess::Write).is_err());
        let _ = std::fs::remove_dir_all(root);
    }

    #[test]
    fn acp_read_without_workspace_rejects_outside_grok_home() {
        let root = acp_path_root();
        let existing = root.join("secret.txt");
        std::fs::write(&existing, "ok").unwrap();
        assert!(resolve_allowed_path(existing.to_str().unwrap(), None, PathAccess::Read).is_err());
        let _ = std::fs::remove_dir_all(root);
    }

#[test]
    fn launcher_arguments_are_platform_specific_and_literal() {
    let target = Path::new("/tmp/a file; touch pwned");
    let (program, args) = open_command(target);
    #[cfg(target_os = "macos")]
    { assert_eq!(program, "open"); assert_eq!(args, vec!["--".into(), target.as_os_str().to_owned()]); }
    #[cfg(target_os = "linux")]
    { assert_eq!(program, "xdg-open"); assert_eq!(args, vec![target.as_os_str().to_owned()]); }
    #[cfg(target_os = "windows")]
    { assert_eq!(program, "explorer"); assert_eq!(args, vec![target.as_os_str().to_owned()]); }
}

    #[test]
    fn explorer_slash_switch_rejects_select_and_allows_drive() {
        assert!(explorer_slash_switch("/select,C:\\Windows"));
        assert!(explorer_slash_switch("/e,C:\\"));
        assert!(!explorer_slash_switch("/C:/Users/me"));
        assert!(!explorer_slash_switch("//server/share"));
        assert!(!explorer_slash_switch("C:\\Users\\me"));
        assert!(!explorer_slash_switch("-evil"));
    }

    #[test]
    fn open_path_arg_rejects_dash_everywhere() {
        assert!(open_path_arg_rejected(""));
        assert!(open_path_arg_rejected("-help"));
        #[cfg(not(windows))]
        assert!(!open_path_arg_rejected("/tmp/ok"));
        #[cfg(windows)]
        {
            assert!(open_path_arg_rejected("/select,C:\\Windows"));
            assert!(!open_path_arg_rejected("C:\\Users\\me"));
        }
    }
}

#[cfg(test)]
mod config_write_tests {
    use super::*;
    use serde_json::json;

    #[test]
    fn config_text_max_is_512_kib() {
        assert_eq!(CONFIG_TEXT_MAX, 512 * 1024);
        assert_eq!(CONFIG_TEXT_MAX, 524288);
    }

    #[test]
    fn config_text_at_cap_is_accepted() {
        let text = "a".repeat(CONFIG_TEXT_MAX);
        assert!(reject_oversized_config_text(&text).is_ok());
    }

    #[test]
    fn config_text_over_cap_is_rejected() {
        let text = "a".repeat(524289);
        let err = reject_oversized_config_text(&text).unwrap_err();
        assert_eq!(err.to_string(), "配置太大");
    }

    #[test]
    fn apply_cli_patch_rejects_proto_key() {
        let mut doc = toml_edit::DocumentMut::new();
        let err = apply_cli_patch(&mut doc, &json!({ "__proto__": "x" })).unwrap_err();
        assert_eq!(err.to_string(), "不支持的设置字段");
    }

    #[test]
    fn apply_cli_patch_rejects_unknown_key() {
        let mut doc = toml_edit::DocumentMut::new();
        let err = apply_cli_patch(&mut doc, &json!({ "unknown": true })).unwrap_err();
        assert_eq!(err.to_string(), "不支持的设置字段");
    }

    #[test]
    fn apply_cli_patch_applies_model() {
        let mut doc = toml_edit::DocumentMut::new();
        apply_cli_patch(&mut doc, &json!({ "model": "grok-4" })).unwrap();
        assert_eq!(doc["models"]["default"].as_str(), Some("grok-4"));
    }

    #[tokio::test]
    async fn config_write_lock_is_exclusive() {
        let state = AppState::default();
        let _guard = state.config_write.lock().await;
        assert!(state.config_write.try_lock().is_err());
    }
}

#[cfg(test)]
mod session_updates_tests {
    use super::*;

    fn sample_line(kind: &str, text: &str) -> String {
        format!(
            r#"{{"params":{{"update":{{"sessionUpdate":"{kind}","content":{{"text":"{text}"}}}}}}}}"#
        )
    }

    #[test]
    fn read_updates_jsonl_seeks_after_first_line_and_returns_remaining_rows() {
        let dir = std::env::temp_dir().join(format!(
            "grok-session-updates-{}-{:?}",
            std::process::id(),
            std::thread::current().id()
        ));
        let _ = std::fs::remove_dir_all(&dir);
        std::fs::create_dir_all(&dir).unwrap();
        let path = dir.join("updates.jsonl");

        let line1 = sample_line("user_message_chunk", "a");
        let line2 = sample_line("agent_message_chunk", "b");
        let line3 = sample_line("agent_thought_chunk", "c");
        let body = format!("{line1}\n{line2}\n{line3}\n");
        std::fs::write(&path, &body).unwrap();
        let first_off = line1.len() as u64 + 1;

        let all = read_updates_jsonl(&path, None).unwrap();
        assert_eq!(all.rows.len(), 3);
        assert_eq!(all.next_byte, body.len() as u64);
        assert!(!all.truncated);

        let rest = read_updates_jsonl(&path, Some(first_off)).unwrap();
        assert_eq!(rest.rows.len(), 2);
        assert_eq!(rest.next_byte, body.len() as u64);
        assert!(!rest.truncated);

        let _ = std::fs::remove_dir_all(&dir);
    }

    #[test]
    fn first_load_reads_tail_and_sets_truncated_when_prefix_skipped() {
        let dir = std::env::temp_dir().join(format!(
            "grok-session-updates-tail-{}-{:?}",
            std::process::id(),
            std::thread::current().id()
        ));
        let _ = std::fs::remove_dir_all(&dir);
        std::fs::create_dir_all(&dir).unwrap();
        let path = dir.join("updates.jsonl");

        let line1 = sample_line("user_message_chunk", "old");
        let line2 = sample_line("agent_message_chunk", "mid");
        let line3 = sample_line("agent_thought_chunk", "new");
        let body = format!("{line1}\n{line2}\n{line3}\n");
        std::fs::write(&path, &body).unwrap();
        let tail_max = (line2.len() + 1 + line3.len() + 1) as u64;

        let page = read_updates_jsonl_limited(&path, None, tail_max).unwrap();
        assert!(page.truncated);
        assert_eq!(page.rows.len(), 2);
        assert_eq!(page.next_byte, body.len() as u64);

        let _ = std::fs::remove_dir_all(&dir);
    }
}
