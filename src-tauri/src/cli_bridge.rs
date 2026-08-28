use crate::{
    config_path, dirs_home, ensure_table, find_session_dir, git_stdout, grok_home, guard_repo_cwd,
    is_blocked_path, is_under, reject_oversized_config_text, resolve_grok, AppError, AppResult,
    AppState,
};
use serde::Deserialize;
use serde_json::{json, Value};
use std::path::{Path, PathBuf};
use std::sync::Arc;
use tauri::{AppHandle, Emitter, Manager, State};
use tokio::io::{AsyncBufReadExt, BufReader};
use tokio::process::Command;
use walkdir::WalkDir;

const GROK_TIMEOUT_SECS: u64 = 90;
const GROK_LONG_TIMEOUT_SECS: u64 = 180;

const AUDIT_ROTATE_BYTES: u64 = 2 * 1024 * 1024;
pub(crate) const ATTACHMENT_BYTE_CAP: u64 = 20 * 1024 * 1024;

fn grok_args_allowed(args: &[String]) -> bool {
    let head = args.first().map(String::as_str).unwrap_or("");
    matches!(
        head,
        "inspect"
            | "mcp"
            | "plugin"
            | "models"
            | "login"
            | "--version"
            | "--help"
            | "help"
    )
}

fn grok_flag_ok(arg: &str) -> bool {
    if arg.chars().any(char::is_whitespace) {
        return false;
    }
    let Some(rest) = arg.strip_prefix("--") else {
        return false;
    };
    let name = rest.split_once('=').map(|(n, _)| n).unwrap_or(rest);
    let mut chars = name.chars();
    match chars.next() {
        Some(c) if c.is_ascii_alphanumeric() => chars.all(|c| c.is_ascii_alphanumeric() || c == '-'),
        _ => false,
    }
}

fn grok_pathlike(arg: &str) -> bool {
    arg.contains('/') || arg.contains('.')
}

fn grok_path_has_parent(arg: &str) -> bool {
    Path::new(arg)
        .components()
        .any(|c| matches!(c, std::path::Component::ParentDir))
}

fn grok_argv_ok(args: &[String]) -> bool {
    if !grok_args_allowed(args) {
        return false;
    }
    for arg in args.iter().skip(1) {
        if arg.starts_with("--") {
            if !grok_flag_ok(arg) {
                return false;
            }
        } else if !arg.starts_with('-') && grok_pathlike(arg) && grok_path_has_parent(arg) {
            return false;
        }
    }
    true
}

pub(crate) fn append_desktop_audit(op: &str, path: &str) {
    let _ = append_desktop_audit_to(&grok_home().join("desktop-audit.jsonl"), op, path);
}

pub(crate) fn append_desktop_audit_to(file: &Path, op: &str, path: &str) -> std::io::Result<()> {
    if let Some(parent) = file.parent() {
        std::fs::create_dir_all(parent)?;
    }
    if let Ok(meta) = std::fs::metadata(file) {
        if meta.len() > AUDIT_ROTATE_BYTES {
            let rotated = PathBuf::from(format!("{}.1", file.display()));
            let _ = std::fs::rename(file, &rotated);
        }
    }
    let ts = std::time::SystemTime::now()
        .duration_since(std::time::UNIX_EPOCH)
        .map(|d| d.as_secs())
        .unwrap_or(0);
    let line = serde_json::json!({ "ts": ts, "op": op, "path": path });
    use std::io::Write;
    let mut f = std::fs::OpenOptions::new().create(true).append(true).open(file)?;
    writeln!(f, "{line}")?;
    Ok(())
}

pub(crate) fn validate_attachment(path: &str, allow_root: Option<&str>) -> AppResult<()> {
    let raw = PathBuf::from(path.trim());
    if !raw.is_absolute() {
        return Err(AppError::Message("附件路径必须是绝对路径".into()));
    }
    let canon = raw
        .canonicalize()
        .map_err(|_| AppError::Message("附件不存在".into()))?;
    if is_blocked_path(&canon) {
        return Err(AppError::Message("不能添加这个附件".into()));
    }
    let meta = std::fs::metadata(&canon).map_err(|_| AppError::Message("附件不存在".into()))?;
    if meta.is_file() && meta.len() > ATTACHMENT_BYTE_CAP {
        return Err(AppError::Message("文件太大".into()));
    }
    let under_home = grok_home()
        .canonicalize()
        .ok()
        .map(|h| is_under(&canon, &h))
        .unwrap_or(false);
    let under_root = allow_root
        .map(str::trim)
        .filter(|s| !s.is_empty())
        .and_then(|r| PathBuf::from(r).canonicalize().ok())
        .map(|r| is_under(&canon, &r))
        .unwrap_or(false);
    if !under_home && !under_root {
        return Err(AppError::Message("附件不在工作区".into()));
    }
    Ok(())
}

#[tauri::command]
pub async fn stat_attachment(path: String, allow_root: Option<String>) -> AppResult<Value> {
    tokio::task::spawn_blocking(move || {
        validate_attachment(&path, allow_root.as_deref())?;
        let meta = std::fs::metadata(path.trim()).map_err(|e| AppError::Message(e.to_string()))?;
        Ok(json!({
            "path": path,
            "bytes": meta.len(),
            "kind": if meta.is_dir() { "dir" } else { "file" },
        }))
    })
    .await
    .map_err(|e| AppError::Message(e.to_string()))?
}

fn apply_grok_env(cmd: &mut Command) {
    let mut path = std::env::var("PATH").unwrap_or_default();
    let extra = grok_home().join("bin");
    if !path.split(':').any(|p| Path::new(p) == extra) {
        path = format!("{}:{path}", extra.display());
    }
    cmd.env("PATH", path);
    cmd.env("HOME", dirs_home());
    cmd.env("GROK_DISABLE_AUTOUPDATER", "1");
}

fn attach_cwd(cmd: &mut Command, cwd: Option<&str>) {
    let Some(raw) = cwd.map(str::trim).filter(|s| !s.is_empty()) else {
        return;
    };
    let dir = PathBuf::from(raw);
    if dir.is_dir() && dir != Path::new("/") {
        cmd.current_dir(dir);
    }
}

async fn grok_output(args: &[String], cwd: Option<&str>, secs: u64) -> AppResult<(Option<i32>, String, String)> {
    if !grok_argv_ok(args) {
        return Err(AppError::Message("不允许的 grok 子命令".into()));
    }
    let grok = resolve_grok().ok_or_else(|| AppError::Message("找不到 grok".into()))?;
    let mut cmd = Command::new(grok);
    cmd.args(args);
    apply_grok_env(&mut cmd);
    attach_cwd(&mut cmd, cwd);
    let run = cmd.output();
    let output = tokio::time::timeout(std::time::Duration::from_secs(secs), run)
        .await
        .map_err(|_| AppError::Message("grok 命令超时".into()))?
        .map_err(|e| AppError::Message(e.to_string()))?;
    Ok((
        output.status.code(),
        String::from_utf8_lossy(&output.stdout).into_owned(),
        String::from_utf8_lossy(&output.stderr).into_owned(),
    ))
}

fn long_timeout(args: &[String]) -> u64 {
    let joined = args.join(" ");
    if joined.contains("plugin install") || joined.contains("plugin marketplace") || joined.contains("mcp doctor")
    {
        GROK_LONG_TIMEOUT_SECS
    } else {
        GROK_TIMEOUT_SECS
    }
}

#[tauri::command]
pub async fn run_grok(args: Vec<String>, cwd: Option<String>) -> AppResult<Value> {
    let secs = long_timeout(&args);
    let (code, stdout, stderr) = grok_output(&args, cwd.as_deref(), secs).await?;
    Ok(json!({ "code": code, "stdout": stdout, "stderr": stderr }))
}

#[tauri::command]
pub async fn run_grok_stream(app: AppHandle, args: Vec<String>, cwd: Option<String>) -> AppResult<Value> {
    if !grok_argv_ok(&args) {
        return Err(AppError::Message("不允许的 grok 子命令".into()));
    }
    let grok = resolve_grok().ok_or_else(|| AppError::Message("找不到 grok".into()))?;
    let mut cmd = Command::new(grok);
    cmd.args(&args)
        .stdout(std::process::Stdio::piped())
        .stderr(std::process::Stdio::piped());
    apply_grok_env(&mut cmd);
    attach_cwd(&mut cmd, cwd.as_deref());
    let mut child = cmd
        .spawn()
        .map_err(|e| AppError::Message(e.to_string()))?;
    let stdout = child.stdout.take();
    let stderr = child.stderr.take();
    let app_out = app.clone();
    let out_task = tauri::async_runtime::spawn(async move {
        let mut buf = String::new();
        if let Some(pipe) = stdout {
            let mut lines = BufReader::new(pipe).lines();
            while let Ok(Some(line)) = lines.next_line().await {
                buf.push_str(&line);
                buf.push('\n');
                let _ = app_out.emit("grok-cli-log", json!({ "stream": "stdout", "line": line }));
            }
        }
        buf
    });
    let app_err = app.clone();
    let err_task = tauri::async_runtime::spawn(async move {
        let mut buf = String::new();
        if let Some(pipe) = stderr {
            let mut lines = BufReader::new(pipe).lines();
            while let Ok(Some(line)) = lines.next_line().await {
                buf.push_str(&line);
                buf.push('\n');
                let _ = app_err.emit("grok-cli-log", json!({ "stream": "stderr", "line": line }));
            }
        }
        buf
    });
    let status = tokio::time::timeout(
        std::time::Duration::from_secs(long_timeout(&args)),
        child.wait(),
    )
    .await
    .map_err(|_| AppError::Message("grok 命令超时".into()))?
    .map_err(|e| AppError::Message(e.to_string()))?;
    let stdout = out_task.await.unwrap_or_default();
    let stderr = err_task.await.unwrap_or_default();
    Ok(json!({ "code": status.code(), "stdout": stdout, "stderr": stderr }))
}

fn resolve_scoped_target(raw: &Path, root: &Path) -> AppResult<PathBuf> {
    let root = root.canonicalize().map_err(|_| AppError::Message("invalid allow root".into()))?;
    let mut missing = Vec::new();
    let mut cursor = raw;
    let resolved = loop {
        if let Ok(mut canon) = cursor.canonicalize() {
            for part in missing.iter().rev() { canon.push(part); }
            break canon;
        }
        let name = cursor.file_name().ok_or_else(|| AppError::Message("不能写入这个路径".into()))?;
        missing.push(name.to_os_string());
        cursor = cursor.parent().ok_or_else(|| AppError::Message("不能写入这个路径".into()))?;
    };
    if !is_under(&resolved, &root) || is_blocked_path(&resolved) {
        return Err(AppError::Message("不能写入这个路径".into()));
    }
    Ok(resolved)
}

fn project_scoped_path(cwd: Option<&str>, trusted: Option<&Path>, relative: &Path) -> Option<PathBuf> {
    let raw = cwd.map(str::trim).filter(|s| !s.is_empty())?;
    let dir = PathBuf::from(raw).canonicalize().ok()?;
    let trusted = trusted?.canonicalize().ok()?;
    if dir != trusted || dir == Path::new("/") { return None; }
    resolve_scoped_target(&dir.join(relative), &dir).ok()
}

fn project_config_path(cwd: Option<&str>, trusted: Option<&Path>) -> Option<PathBuf> {
    project_scoped_path(cwd, trusted, Path::new(".grok/config.toml"))
}


#[tauri::command]
pub async fn read_config_text(state: State<'_, Arc<AppState>>, scope: String, cwd: Option<String>) -> AppResult<Value> {
    let path = if scope == "project" {
        project_config_path(cwd.as_deref(), state.workspace.lock().await.as_deref())
            .ok_or_else(|| AppError::Message("没有项目配置路径".into()))?
    } else {
        config_path()
    };
    let exists = path.is_file();
    let text = if exists {
        tokio::fs::read_to_string(&path)
            .await
            .map_err(|e| AppError::Message(e.to_string()))?
    } else {
        String::new()
    };
    Ok(json!({ "path": path.display().to_string(), "text": text, "exists": exists }))
}

#[tauri::command]
pub async fn write_config_text(state: State<'_, Arc<AppState>>, scope: String, text: String, cwd: Option<String>) -> AppResult<()> {
    reject_oversized_config_text(&text)?;
    let _guard = state.config_write.lock().await;
    let path = if scope == "project" {
        project_config_path(cwd.as_deref(), state.workspace.lock().await.as_deref())
            .ok_or_else(|| AppError::Message("没有项目配置路径".into()))?
    } else {
        config_path()
    };
    if path
        .to_string_lossy()
        .contains("auth.json")
    {
        return Err(AppError::Message("不能写 auth".into()));
    }
    if let Some(parent) = path.parent() {
        tokio::fs::create_dir_all(parent)
            .await
            .map_err(|e| AppError::Message(e.to_string()))?;
    }
    tokio::fs::write(&path, text)
        .await
        .map_err(|e| AppError::Message(e.to_string()))?;
    append_desktop_audit("write_config_text", &path.display().to_string());
    Ok(())
}

fn allow_write(canon: &Path, allow_root: Option<&Path>) -> bool {
    if is_blocked_path(canon) {
        return false;
    }
    if let Ok(home) = grok_home().canonicalize() {
        if is_under(canon, &home) && canon.file_name().and_then(|n| n.to_str()) != Some("auth.json") {
            return true;
        }
    }
    if let Some(root) = allow_root {
        if is_under(canon, root) {
            return true;
        }
    }
    false
}

fn scoped_write_target(raw: &Path, trusted: Option<&Path>) -> AppResult<PathBuf> {
    let grok = grok_home().canonicalize().ok();
    let canon = if let Some(root) = trusted {
        match resolve_scoped_target(raw, root) {
            Ok(path) => path,
            Err(_) if grok.is_some() => resolve_scoped_target(raw, grok.as_ref().unwrap())?,
            Err(err) => return Err(err),
        }
    } else if let Some(root) = grok.as_ref() {
        resolve_scoped_target(raw, root)?
    } else {
        return Err(AppError::Message("不能写入这个路径".into()));
    };
    if !allow_write(&canon, trusted) {
        return Err(AppError::Message("不能写入这个路径".into()));
    }
    Ok(canon)
}

/// Write `bytes` to `path` without following a final-component symlink (TOCTOU-safe on Unix).
pub(crate) fn write_nofollow(path: &Path, bytes: &[u8]) -> std::io::Result<()> {
    if let Some(parent) = path.parent().filter(|p| !p.as_os_str().is_empty()) {
        std::fs::create_dir_all(parent)?;
    }
    #[cfg(unix)]
    {
        use std::io::Write;
        use std::os::unix::fs::OpenOptionsExt;
        let mut file = std::fs::OpenOptions::new()
            .write(true)
            .create(true)
            .truncate(true)
            .custom_flags(o_nofollow())
            .open(path)?;
        file.write_all(bytes)
    }
    #[cfg(not(unix))]
    {
        if path.symlink_metadata().map(|m| m.file_type().is_symlink()).unwrap_or(false) {
            return Err(std::io::Error::new(
                std::io::ErrorKind::Other,
                "refusing to write through a symlink",
            ));
        }
        std::fs::write(path, bytes)
    }
}

#[cfg(unix)]
fn o_nofollow() -> i32 {
    // fcntl.h O_NOFOLLOW; avoid a direct libc dependency.
    #[cfg(any(
        target_os = "linux",
        target_os = "android",
        target_os = "emscripten",
        target_os = "solaris",
        target_os = "illumos"
    ))]
    {
        0x20000
    }
    #[cfg(any(
        target_os = "macos",
        target_os = "ios",
        target_os = "tvos",
        target_os = "watchos",
        target_os = "freebsd",
        target_os = "dragonfly",
        target_os = "netbsd",
        target_os = "openbsd"
    ))]
    {
        0x0100
    }
}

#[tauri::command]
pub async fn write_allowed_text(
    state: State<'_, Arc<AppState>>,
    path: String,
    text: String,
    allow_root: Option<String>,
) -> AppResult<()> {
    if text.len() > 2 * 1024 * 1024 {
        return Err(AppError::Message("内容超过 2MB".into()));
    }
    let workspace = state.workspace.lock().await.clone();
    tokio::task::spawn_blocking(move || {
        let raw = PathBuf::from(path.trim());
        if !raw.is_absolute() {
            return Err(AppError::Message("path must be absolute".into()));
        }
        let trusted = crate::trusted_desktop_root(workspace.as_deref(), allow_root.as_deref()).map_err(AppError::Message)?;
        let canon = scoped_write_target(&raw, trusted.as_deref())?;
        if let Some(parent) = canon.parent() { std::fs::create_dir_all(parent).map_err(|e| AppError::Message(e.to_string()))?; }
        let checked = scoped_write_target(&canon, trusted.as_deref())?;
        write_nofollow(&checked, text.as_bytes()).map_err(|e| AppError::Message(e.to_string()))?;
        append_desktop_audit("write_allowed_text", &checked.display().to_string());
        Ok(())
    })
    .await
    .map_err(|e| AppError::Message(e.to_string()))?
}

#[tauri::command]
pub async fn git_log(cwd: String) -> AppResult<Value> {
    let Some(root) = crate::git_repo_root(&cwd).await else {
        return Ok(json!([]));
    };
    let text = git_stdout(&root, &["log", "-30", "--format=%h\t%ad\t%s", "--date=short"])
        .await
        .unwrap_or_default();
    let rows: Vec<Value> = text
        .lines()
        .filter_map(|line| {
            let mut parts = line.splitn(3, '\t');
            let hash = parts.next()?;
            let date = parts.next().unwrap_or("");
            let subject = parts.next().unwrap_or("");
            Some(json!({ "hash": hash, "date": date, "subject": subject }))
        })
        .collect();
    Ok(json!(rows))
}

#[tauri::command]
pub async fn git_branches(cwd: String) -> AppResult<Vec<String>> {
    let Some(root) = crate::git_repo_root(&cwd).await else {
        return Ok(vec![]);
    };
    let text = git_stdout(&root, &["branch", "--all", "--no-color"])
        .await
        .unwrap_or_default();
    Ok(text
        .lines()
        .map(|l| l.trim().trim_start_matches('*').trim().to_string())
        .filter(|l| !l.is_empty() && !l.contains("HEAD ->"))
        .take(40)
        .collect())
}

#[tauri::command]
pub async fn list_file_tree(cwd: String, query: Option<String>) -> AppResult<Value> {
    tokio::task::spawn_blocking(move || {
        let Some(root) = guard_repo_cwd(&cwd) else {
            return Ok(json!([]));
        };
        let q = query.unwrap_or_default().to_lowercase();
        let mut out = Vec::new();
        for entry in WalkDir::new(&root)
            .max_depth(5)
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
            if entry.depth() == 0 {
                continue;
            }
            let rel = entry
                .path()
                .strip_prefix(&root)
                .unwrap_or(entry.path())
                .to_string_lossy()
                .to_string();
            if !q.is_empty() && !rel.to_lowercase().contains(&q) {
                continue;
            }
            out.push(json!({
                "name": entry.file_name().to_string_lossy(),
                "path": entry.path().to_string_lossy(),
                "kind": if entry.file_type().is_dir() { "dir" } else { "file" },
            }));
            if out.len() >= 200 {
                break;
            }
        }
        Ok(json!(out))
    })
    .await
    .map_err(|e| AppError::Message(e.to_string()))?
}

#[tauri::command]
pub async fn hide_window(app: AppHandle) -> AppResult<()> {
    if let Some(window) = app.get_webview_window("main") {
        window.hide().map_err(|e| AppError::Message(e.to_string()))?;
    }
    Ok(())
}

#[tauri::command]
pub async fn set_hide_on_close(state: State<'_, Arc<AppState>>, hide: bool) -> AppResult<()> {
    *state.hide_on_close.lock().await = hide;
    Ok(())
}

#[tauri::command]
pub async fn read_models_cache() -> AppResult<Value> {
    let path = grok_home().join("models_cache.json");
    if !path.is_file() {
        return Ok(json!({}));
    }
    let text = tokio::fs::read_to_string(path)
        .await
        .map_err(|e| AppError::Message(e.to_string()))?;
    serde_json::from_str(&text).map_err(|e| AppError::Message(e.to_string()))
}

#[tauri::command]
pub async fn list_models_text() -> AppResult<String> {
    let (_, stdout, _) = grok_output(&["models".into()], None, 20).await?;
    Ok(stdout)
}

#[tauri::command]
pub async fn trust_folder(cwd: String, trusted: bool) -> AppResult<()> {
    tokio::task::spawn_blocking(move || {
        let dir = PathBuf::from(cwd.trim())
            .canonicalize()
            .map_err(|_| AppError::Message("无效目录".into()))?;
        if dir == Path::new("/") || dir == dirs_home() {
            return Err(AppError::Message("不能信任系统根目录".into()));
        }
        let path = grok_home().join("trusted_folders.toml");
        let text = if path.is_file() {
            std::fs::read_to_string(&path).unwrap_or_default()
        } else {
            String::new()
        };
        let mut doc = text.parse::<toml_edit::DocumentMut>().unwrap_or_default();
        let key = format!("folders.\"{}\"", dir.display());
        let folders = ensure_table(&mut doc, "folders");
        let entry = folders.entry(&dir.display().to_string()).or_insert_with(|| {
            let mut t = toml_edit::Table::new();
            t.set_implicit(false);
            toml_edit::Item::Table(t)
        });
        if let Some(tbl) = entry.as_table_like_mut() {
            tbl.insert("trusted", toml_edit::value(trusted));
            tbl.insert(
                "decided_at",
                toml_edit::value(
                    std::time::SystemTime::now()
                        .duration_since(std::time::UNIX_EPOCH)
                        .map(|d| d.as_secs() as i64)
                        .unwrap_or(0),
                ),
            );
        }
        let _ = key;
        if let Some(parent) = path.parent() {
            let _ = std::fs::create_dir_all(parent);
        }
        std::fs::write(path, doc.to_string()).map_err(|e| AppError::Message(e.to_string()))
    })
    .await
    .map_err(|e| AppError::Message(e.to_string()))?
}

#[derive(Debug, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct CreateSkillInput {
    name: String,
    scope: String,
    description: Option<String>,
    cwd: Option<String>,
    template: Option<String>,
}

fn skill_name_ok(name: &str) -> bool {
    let len = name.chars().count();
    if len < 2 || len > 64 {
        return false;
    }
    let mut chars = name.chars();
    let first = chars.next().unwrap();
    if !first.is_ascii_alphanumeric() {
        return false;
    }
    name.chars()
        .all(|c| c.is_ascii_lowercase() || c.is_ascii_digit() || c == '-')
}

#[tauri::command]
pub async fn create_skill(state: State<'_, Arc<AppState>>, input: CreateSkillInput) -> AppResult<Value> {
    let name = input.name.trim().to_lowercase();
    if !skill_name_ok(&name) {
        return Err(AppError::Message("技能名只能用小写字母、数字和连字符".into()));
    }
    let desc = input
        .description
        .as_deref()
        .map(str::trim)
        .filter(|s| !s.is_empty())
        .unwrap_or("Describe when to use this skill.");
    let body = match input.template.as_deref() {
        Some("review") => format!(
            "---
name: {name}
description: {desc}
user-invocable: true
---

# {name}

Review the current change set and report risks.
"
        ),
        Some("commit") => format!(
            "---
name: {name}
description: {desc}
user-invocable: true
---

# {name}

Inspect staged files and write a conventional commit.
"
        ),
        _ => format!(
            "---
name: {name}
description: {desc}
user-invocable: true
---

# {name}

Write the procedure here.
"
        ),
    };
    let trusted = state.workspace.lock().await.clone();
    let path = if input.scope == "project" {
        project_scoped_path(
            input.cwd.as_deref(),
            trusted.as_deref(),
            Path::new(".grok/skills").join(&name).join("SKILL.md").as_path(),
        )
        .ok_or_else(|| AppError::Message("没有项目技能路径".into()))?
    } else {
        let home = grok_home();
        tokio::fs::create_dir_all(&home)
            .await
            .map_err(|e| AppError::Message(e.to_string()))?;
        resolve_scoped_target(&home.join("skills").join(&name).join("SKILL.md"), &home)?
    };
    if let Some(parent) = path.parent() {
        tokio::fs::create_dir_all(parent)
            .await
            .map_err(|e| AppError::Message(e.to_string()))?;
    }
    tokio::fs::write(&path, body)
        .await
        .map_err(|e| AppError::Message(e.to_string()))?;
    Ok(json!({ "path": path.display().to_string() }))
}

#[tauri::command]
pub async fn patch_skills_disabled(names: Vec<String>) -> AppResult<()> {
    tokio::task::spawn_blocking(move || {
        let path = config_path();
        let text = if path.is_file() {
            std::fs::read_to_string(&path).unwrap_or_default()
        } else {
            String::new()
        };
        let mut doc = text.parse::<toml_edit::DocumentMut>().unwrap_or_default();
        let skills = ensure_table(&mut doc, "skills");
        let mut arr = toml_edit::Array::new();
        for name in names {
            if !name.trim().is_empty() {
                arr.push(name);
            }
        }
        skills["disabled"] = toml_edit::value(arr);
        if let Some(parent) = path.parent() {
            let _ = std::fs::create_dir_all(parent);
        }
        std::fs::write(path, doc.to_string()).map_err(|e| AppError::Message(e.to_string()))
    })
    .await
    .map_err(|e| AppError::Message(e.to_string()))?
}

#[tauri::command]
pub async fn patch_compat(vendor: String, surface: String, enabled: bool) -> AppResult<()> {
    if !matches!(vendor.as_str(), "claude" | "cursor") {
        return Err(AppError::Message("只支持 claude / cursor".into()));
    }
    if !matches!(surface.as_str(), "skills" | "mcps" | "hooks") {
        return Err(AppError::Message("只支持 skills / mcps / hooks".into()));
    }
    tokio::task::spawn_blocking(move || {
        let path = config_path();
        let text = if path.is_file() {
            std::fs::read_to_string(&path).unwrap_or_default()
        } else {
            String::new()
        };
        let mut doc = text.parse::<toml_edit::DocumentMut>().unwrap_or_default();
        let key = format!("compat.{vendor}");
        if !doc.contains_key("compat") {
            doc["compat"] = toml_edit::Item::Table(toml_edit::Table::new());
        }
        let compat = doc["compat"].as_table_mut().expect("compat");
        if !compat.contains_key(&vendor) {
            compat[&vendor] = toml_edit::Item::Table(toml_edit::Table::new());
        }
        if let Some(tbl) = compat[&vendor].as_table_mut() {
            tbl[&surface] = toml_edit::value(enabled);
        }
        let _ = key;
        std::fs::write(path, doc.to_string()).map_err(|e| AppError::Message(e.to_string()))
    })
    .await
    .map_err(|e| AppError::Message(e.to_string()))?
}

#[tauri::command]
pub async fn list_session_spills(session_id: String) -> AppResult<Vec<String>> {
    tokio::task::spawn_blocking(move || {
        let Some(dir) = find_session_dir(&session_id) else {
            return Ok(vec![]);
        };
        let mcp = dir.join("mcp");
        if !mcp.is_dir() {
            return Ok(vec![]);
        }
        let mut out = Vec::new();
        for entry in WalkDir::new(&mcp).max_depth(2).into_iter().flatten() {
            if entry.file_type().is_file() {
                out.push(entry.path().to_string_lossy().into_owned());
            }
            if out.len() >= 40 {
                break;
            }
        }
        Ok(out)
    })
    .await
    .map_err(|e| AppError::Message(e.to_string()))?
}

#[tauri::command]
pub async fn list_imagine_artifacts(cwd: Option<String>) -> AppResult<Vec<String>> {
    tokio::task::spawn_blocking(move || {
        let mut roots = vec![
            grok_home().join("downloads"),
            dirs_home().join("Downloads"),
        ];
        if let Some(c) = cwd.as_deref().filter(|s| !s.is_empty()) {
            roots.push(PathBuf::from(c));
        }
        let mut out = Vec::new();
        for root in roots {
            if !root.is_dir() {
                continue;
            }
            for entry in WalkDir::new(&root).max_depth(3).into_iter().flatten() {
                if !entry.file_type().is_file() {
                    continue;
                }
                let name = entry.file_name().to_string_lossy().to_lowercase();
                let ok = name.ends_with(".png")
                    || name.ends_with(".jpg")
                    || name.ends_with(".jpeg")
                    || name.ends_with(".webp")
                    || name.ends_with(".gif")
                    || name.ends_with(".mp4")
                    || name.ends_with(".webm")
                    || name.contains("imagine");
                if !ok {
                    continue;
                }
                out.push(entry.path().to_string_lossy().into_owned());
                if out.len() >= 80 {
                    return Ok(out);
                }
            }
        }
        Ok(out)
    })
    .await
    .map_err(|e| AppError::Message(e.to_string()))?
}

#[tauri::command]
pub async fn open_in_terminal(cwd: String) -> AppResult<()> {
    let dir = PathBuf::from(cwd.trim());
    if !dir.is_dir() {
        return Err(AppError::Message("目录不存在".into()));
    }
    let status = Command::new("open")
        .args(["-a", "Terminal.app", "--"])
        .arg(&dir)
        .status()
        .await
        .map_err(|e| AppError::Message(e.to_string()))?;
    if !status.success() {
        return Err(AppError::Message("无法打开 Terminal.app".into()));
    }
    Ok(())
}

#[tauri::command]
pub async fn read_managed_config() -> AppResult<Value> {
    let candidates = [
        grok_home().join("managed_config.toml"),
        PathBuf::from("/etc/grok/managed_config.toml"),
        grok_home().join("requirements.toml"),
    ];
    for path in candidates {
        if path.is_file() {
            let text = tokio::fs::read_to_string(&path)
                .await
                .unwrap_or_default();
            return Ok(json!({
                "path": path.display().to_string(),
                "text": text,
                "exists": true
            }));
        }
    }
    Ok(json!({
        "path": grok_home().join("managed_config.toml").display().to_string(),
        "text": "",
        "exists": false
    }))
}

#[tauri::command]
pub async fn set_notify_target(state: State<'_, Arc<AppState>>, session_id: Option<String>) -> AppResult<()> {
    *state.notify_target.lock().await = session_id.filter(|s| !s.is_empty());
    Ok(())
}

#[tauri::command]
pub async fn write_hook_file(
    state: State<'_, Arc<AppState>>,
    scope: String,
    filename: String,
    text: String,
    cwd: Option<String>,
) -> AppResult<Value> {
    let safe = Path::new(&filename)
        .file_name()
        .and_then(|n| n.to_str())
        .unwrap_or("");
    if !safe.ends_with(".json") || safe.len() > 80 {
        return Err(AppError::Message("hook 文件名不合法".into()));
    }
    let trusted = state.workspace.lock().await.clone();
    let path = if scope == "project" {
        project_scoped_path(
            cwd.as_deref(),
            trusted.as_deref(),
            Path::new(".grok/hooks").join(safe).as_path(),
        )
        .ok_or_else(|| AppError::Message("没有项目 hook 路径".into()))?
    } else {
        let home = grok_home();
        tokio::fs::create_dir_all(&home)
            .await
            .map_err(|e| AppError::Message(e.to_string()))?;
        resolve_scoped_target(&home.join("hooks").join(safe), &home)?
    };
    if let Some(parent) = path.parent() {
        tokio::fs::create_dir_all(parent)
            .await
            .map_err(|e| AppError::Message(e.to_string()))?;
    }
    tokio::fs::write(&path, text)
        .await
        .map_err(|e| AppError::Message(e.to_string()))?;
    Ok(json!({ "path": path.display().to_string() }))
}

#[tauri::command]
pub async fn list_agents_dir() -> AppResult<Value> {
    tokio::task::spawn_blocking(|| {
        let mut out = Vec::new();
        for (kind, dir) in [
            ("agent", grok_home().join("agents")),
            ("persona", grok_home().join("personas")),
        ] {
            if !dir.is_dir() {
                continue;
            }
            let Ok(rd) = std::fs::read_dir(&dir) else {
                continue;
            };
            for ent in rd.flatten() {
                let name = ent.file_name().to_string_lossy().into_owned();
                if name.starts_with('.') {
                    continue;
                }
                out.push(json!({
                    "name": name,
                    "path": ent.path().to_string_lossy(),
                    "kind": kind,
                }));
            }
        }
        out.sort_by(|a, b| {
            a.get("name")
                .and_then(|v| v.as_str())
                .unwrap_or("")
                .cmp(b.get("name").and_then(|v| v.as_str()).unwrap_or(""))
        });
        Ok(json!(out))
    })
    .await
    .map_err(|e| AppError::Message(e.to_string()))?
}

#[tauri::command]
pub async fn workspace_mtime(cwd: String) -> AppResult<u64> {
    tokio::task::spawn_blocking(move || {
        let Some(root) = guard_repo_cwd(&cwd) else {
            return Ok(0);
        };
        let mut latest = 0u64;
        for entry in WalkDir::new(&root)
            .max_depth(3)
            .into_iter()
            .filter_entry(|e| {
                let name = e.file_name().to_string_lossy();
                !matches!(
                    name.as_ref(),
                    "node_modules" | ".git" | "target" | "dist" | ".next"
                )
            })
            .flatten()
        {
            if let Ok(meta) = entry.metadata() {
                if let Ok(t) = meta.modified() {
                    if let Ok(d) = t.duration_since(std::time::UNIX_EPOCH) {
                        latest = latest.max(d.as_millis() as u64);
                    }
                }
            }
        }
        Ok(latest)
    })
    .await
    .map_err(|e| AppError::Message(e.to_string()))?
}

#[tauri::command]
pub async fn read_usage_history() -> AppResult<Value> {
    tokio::task::spawn_blocking(|| {
        let root = grok_home().join("sessions");
        if !root.is_dir() {
            return Ok(json!([]));
        }
        let mut out = Vec::new();
        for entry in WalkDir::new(&root).max_depth(4).into_iter().flatten() {
            if entry.file_name() != "signals.json" {
                continue;
            }
            let Ok(text) = std::fs::read_to_string(entry.path()) else {
                continue;
            };
            let Ok(value) = serde_json::from_str::<Value>(&text) else {
                continue;
            };
            let used = value
                .get("contextTokensUsed")
                .and_then(|v| v.as_u64())
                .unwrap_or(0);
            let size = value
                .get("contextWindowTokens")
                .and_then(|v| v.as_u64())
                .unwrap_or(0);
            let at = entry
                .metadata()
                .ok()
                .and_then(|m| m.modified().ok())
                .and_then(|t| t.duration_since(std::time::UNIX_EPOCH).ok())
                .map(|d| d.as_millis() as u64)
                .unwrap_or(0);
            if size > 0 {
                out.push(json!({ "at": at, "used": used, "size": size }));
            }
            if out.len() >= 200 {
                break;
            }
        }
        Ok(json!(out))
    })
    .await
    .map_err(|e| AppError::Message(e.to_string()))?
}

const TOKEN_TURNS_MAX: usize = 4000;

fn json_u64(value: Option<&Value>) -> u64 {
    let Some(v) = value else {
        return 0;
    };
    if let Some(n) = v.as_u64() {
        return n;
    }
    if let Some(n) = v.as_i64() {
        return n.max(0) as u64;
    }
    v.as_f64().map(|n| n.max(0.0) as u64).unwrap_or(0)
}

fn decode_session_cwd(encoded: &str) -> String {
    let bytes = encoded.as_bytes();
    let mut out = Vec::with_capacity(bytes.len());
    let mut i = 0;
    while i < bytes.len() {
        if bytes[i] == b'%' && i + 2 < bytes.len() {
            if let Ok(byte) = u8::from_str_radix(std::str::from_utf8(&bytes[i + 1..i + 3]).unwrap_or(""), 16) {
                out.push(byte);
                i += 3;
                continue;
            }
        }
        out.push(bytes[i]);
        i += 1;
    }
    String::from_utf8_lossy(&out).into_owned()
}

pub(crate) fn token_turn_from_record(value: &Value, cwd: &str) -> Option<Value> {
    let params = value.get("params").unwrap_or(value);
    let update = params.get("update").unwrap_or(params);
    if update.get("sessionUpdate").and_then(|v| v.as_str()) != Some("turn_completed") {
        return None;
    }
    let usage = update.get("usage")?;
    let input = json_u64(usage.get("inputTokens").or_else(|| usage.get("input_tokens")));
    let output = json_u64(usage.get("outputTokens").or_else(|| usage.get("output_tokens")));
    let cache_read = json_u64(
        usage
            .get("cachedReadTokens")
            .or_else(|| usage.get("cache_read_input_tokens"))
            .or_else(|| usage.get("cacheReadInputTokens")),
    );
    let cache_create = json_u64(
        usage
            .get("cacheCreationTokens")
            .or_else(|| usage.get("cache_creation_input_tokens")),
    );
    let total = json_u64(usage.get("totalTokens").or_else(|| usage.get("total_tokens")));
    if input == 0 && output == 0 && cache_read == 0 && total == 0 {
        return None;
    }
    let model = usage
        .get("modelUsage")
        .and_then(|v| v.as_object())
        .and_then(|map| map.keys().next())
        .cloned()
        .unwrap_or_default();
    let at = params
        .get("_meta")
        .and_then(|m| m.get("agentTimestampMs"))
        .and_then(|v| v.as_u64())
        .or_else(|| {
            value.get("timestamp").and_then(|v| v.as_f64()).map(|ts| {
                if ts > 100_000_000_000.0 {
                    ts as u64
                } else {
                    (ts * 1000.0) as u64
                }
            })
        })
        .unwrap_or(0);
    Some(json!({
        "at": at,
        "cwd": cwd,
        "model": model,
        "input": input,
        "output": output,
        "cacheRead": cache_read,
        "cacheCreate": cache_create,
        "total": if total > 0 { total } else { input.saturating_add(output) },
        "modelCalls": json_u64(usage.get("modelCalls")),
        "costTicks": json_u64(usage.get("costUsdTicks").or_else(|| usage.get("total_cost_usd_ticks"))),
    }))
}

#[tauri::command]
pub async fn read_token_turns() -> AppResult<Value> {
    tokio::task::spawn_blocking(|| {
        let root = grok_home().join("sessions");
        if !root.is_dir() {
            return Ok(json!([]));
        }
        let mut out = Vec::new();
        for entry in WalkDir::new(&root).max_depth(4).into_iter().flatten() {
            if entry.file_name() != "updates.jsonl" {
                continue;
            }
            let cwd = entry
                .path()
                .parent()
                .and_then(|session| session.parent())
                .and_then(|folder| folder.file_name())
                .and_then(|name| name.to_str())
                .map(decode_session_cwd)
                .unwrap_or_default();
            let Ok(text) = std::fs::read_to_string(entry.path()) else {
                continue;
            };
            for line in text.lines() {
                if !line.contains("turn_completed") {
                    continue;
                }
                let Ok(value) = serde_json::from_str::<Value>(line) else {
                    continue;
                };
                if let Some(row) = token_turn_from_record(&value, &cwd) {
                    out.push(row);
                }
            }
        }
        out.sort_by(|a, b| {
            let at = |v: &Value| v.get("at").and_then(|n| n.as_u64()).unwrap_or(0);
            at(b).cmp(&at(a))
        });
        out.truncate(TOKEN_TURNS_MAX);
        Ok(json!(out))
    })
    .await
    .map_err(|e| AppError::Message(e.to_string()))?
}

#[cfg(test)]
mod security_tests {
    use super::*;
    use std::time::{SystemTime, UNIX_EPOCH};

    fn temp_dir(label: &str) -> PathBuf {
        let id = SystemTime::now().duration_since(UNIX_EPOCH).unwrap().as_nanos();
        let path = std::env::temp_dir().join(format!("grok-webui-{label}-{}-{id}", std::process::id()));
        std::fs::create_dir_all(&path).unwrap();
        path
    }

    #[test]
    fn token_turn_reads_acp_turn_completed_usage() {
        let raw = json!({
            "timestamp": 1_787_550_033,
            "params": {
                "update": {
                    "sessionUpdate": "turn_completed",
                    "usage": {
                        "inputTokens": 1000,
                        "outputTokens": 40,
                        "totalTokens": 1040,
                        "cachedReadTokens": 800,
                        "cacheCreationTokens": 0,
                        "modelCalls": 3,
                        "costUsdTicks": 126890500,
                        "modelUsage": { "grok-4.6-build": { "inputTokens": 1000 } }
                    }
                }
            }
        });
        let row = super::token_turn_from_record(&raw, "/work").unwrap();
        assert_eq!(row["input"], 1000);
        assert_eq!(row["output"], 40);
        assert_eq!(row["cacheRead"], 800);
        assert_eq!(row["model"], "grok-4.6-build");
        assert_eq!(row["cwd"], "/work");
        assert_eq!(row["at"].as_u64(), Some(1_787_550_033_000));
        assert_eq!(row["costTicks"], 126890500);
    }

    #[test]
    fn decode_session_cwd_unescapes_percent_path() {
        assert_eq!(super::decode_session_cwd("%2FUsers%2Ffoxie%2Fwork"), "/Users/foxie/work");
    }

    #[test]
    fn resolves_new_write_targets_inside_root() {
        let root = temp_dir("write-ok").canonicalize().unwrap();
        let target = root.join("new").join("note.md");
        assert_eq!(resolve_scoped_target(&target, &root).unwrap(), target);
        let _ = std::fs::remove_dir_all(root);
    }

    #[cfg(unix)]
    #[test]
    fn rejects_new_write_target_through_symlinked_parent() {
        use std::os::unix::fs::symlink;
        let root = temp_dir("write-root").canonicalize().unwrap();
        let outside = temp_dir("write-outside").canonicalize().unwrap();
        symlink(&outside, root.join("linked")).unwrap();
        assert!(resolve_scoped_target(&root.join("linked/note.md"), &root).is_err());
        let _ = std::fs::remove_dir_all(root);
        let _ = std::fs::remove_dir_all(outside);
    }

    #[test]
    fn project_config_requires_trusted_workspace_match() {
        let root = temp_dir("config-ok").canonicalize().unwrap();
        let path = project_config_path(Some(root.to_str().unwrap()), Some(&root)).unwrap();
        assert!(project_config_path(Some("/"), Some(&root)).is_none());
        assert!(project_config_path(Some(root.to_str().unwrap()), None).is_none());
        assert_eq!(path, root.join(".grok/config.toml"));
        let _ = std::fs::remove_dir_all(root);
    }

    #[test]
    fn project_skill_and_hook_paths_require_trusted_workspace_match() {
        let root = temp_dir("skill-ok").canonicalize().unwrap();
        let hint = root.to_str().unwrap();
        let skill = Path::new(".grok/skills/demo-skill/SKILL.md");
        let hook = Path::new(".grok/hooks/protect.json");
        assert_eq!(
            project_scoped_path(Some(hint), Some(&root), skill).unwrap(),
            root.join(skill)
        );
        assert_eq!(
            project_scoped_path(Some(hint), Some(&root), hook).unwrap(),
            root.join(hook)
        );
        assert!(project_scoped_path(Some("/"), Some(&root), skill).is_none());
        assert!(project_scoped_path(Some(hint), None, hook).is_none());
        let _ = std::fs::remove_dir_all(root);
    }

    #[cfg(unix)]
    #[test]
    fn project_skill_and_hook_paths_reject_symlinked_grok_directory() {
        use std::os::unix::fs::symlink;
        let root = temp_dir("skill-root").canonicalize().unwrap();
        let outside = temp_dir("skill-outside").canonicalize().unwrap();
        symlink(&outside, root.join(".grok")).unwrap();
        assert!(project_scoped_path(
            Some(root.to_str().unwrap()),
            Some(&root),
            Path::new(".grok/skills/demo-skill/SKILL.md")
        ).is_none());
        assert!(project_scoped_path(
            Some(root.to_str().unwrap()),
            Some(&root),
            Path::new(".grok/hooks/protect.json")
        ).is_none());
        let _ = std::fs::remove_dir_all(root);
        let _ = std::fs::remove_dir_all(outside);
    }

    #[cfg(unix)]
    #[test]
    fn project_config_rejects_symlinked_grok_directory() {
        use std::os::unix::fs::symlink;
        let root = temp_dir("config-root").canonicalize().unwrap();
        let outside = temp_dir("config-outside").canonicalize().unwrap();
        symlink(&outside, root.join(".grok")).unwrap();
        assert!(project_config_path(Some(root.to_str().unwrap()), Some(&root)).is_none());
        let _ = std::fs::remove_dir_all(root);
        let _ = std::fs::remove_dir_all(outside);
    }

    #[cfg(unix)]
    #[test]
    fn write_nofollow_writes_regular_file_and_rejects_outside_symlink() {
        use std::os::unix::fs::symlink;
        let root = temp_dir("nofollow").canonicalize().unwrap();
        let regular = root.join("note.txt");
        super::write_nofollow(&regular, b"hello").expect("regular file write");
        assert_eq!(std::fs::read(&regular).unwrap(), b"hello");

        let outside = PathBuf::from("/tmp/pwned-outside");
        std::fs::write(&outside, b"original").unwrap();
        let link = root.join("link.txt");
        symlink(&outside, &link).unwrap();

        assert!(super::write_nofollow(&link, b"pwned").is_err());
        assert_eq!(std::fs::read(&outside).unwrap(), b"original");

        let _ = std::fs::remove_dir_all(root);
        let _ = std::fs::remove_file(outside);
    }

    #[test]
    fn grok_argv_ok_allows_inspect_json() {
        let args = vec!["inspect".to_string(), "--json".to_string()];
        assert!(grok_argv_ok(&args));
    }

    #[test]
    fn grok_argv_ok_rejects_semicolon_flag() {
        let args = vec!["inspect".to_string(), "--;rm".to_string()];
        assert!(!grok_argv_ok(&args));
    }

    #[test]
    fn grok_argv_ok_rejects_bare_double_dash() {
        let args = vec!["mcp".to_string(), "--".to_string()];
        assert!(!grok_argv_ok(&args));
    }

    #[test]
    fn grok_argv_ok_rejects_flag_with_space_and_command_subst() {
        assert!(!grok_argv_ok(&["inspect".into(), "--foo bar".into()]));
        assert!(!grok_argv_ok(&["inspect".into(), "--$(id)".into()]));
        assert!(!grok_argv_ok(&["inspect".into(), "foo/../secret".into()]));
    }

    #[test]
    fn audit_helper_writes_a_line() {
        let dir = temp_dir("audit-log");
        let file = dir.join("desktop-audit.jsonl");
        super::append_desktop_audit_to(&file, "write_allowed_text", "/tmp/note.md").unwrap();
        let text = std::fs::read_to_string(&file).unwrap();
        let v: serde_json::Value = serde_json::from_str(text.trim()).unwrap();
        assert_eq!(v["op"], "write_allowed_text");
        assert_eq!(v["path"], "/tmp/note.md");
        assert!(v.get("ts").is_some());
        assert!(!text.contains("note body"));
        let _ = std::fs::remove_dir_all(dir);
    }

    #[test]
    fn validate_attachment_rejects_over_20mb() {
        let root = temp_dir("attach-big").canonicalize().unwrap();
        let file = root.join("big.bin");
        let f = std::fs::File::create(&file).unwrap();
        f.set_len(ATTACHMENT_BYTE_CAP + 1).unwrap();
        assert!(validate_attachment(file.to_str().unwrap(), Some(root.to_str().unwrap())).is_err());
        let _ = std::fs::remove_dir_all(root);
    }
}
