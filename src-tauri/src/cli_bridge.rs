use crate::{
    config_path, dirs_home, ensure_table, find_session_dir, git_stdout, grok_home, guard_repo_cwd,
    is_blocked_path, is_under, resolve_grok, AppError, AppResult, AppState,
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
    if !grok_args_allowed(args) {
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
    if !grok_args_allowed(&args) {
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
        let name = cursor.file_name().ok_or_else(|| AppError::Message("path not allowed".into()))?;
        missing.push(name.to_os_string());
        cursor = cursor.parent().ok_or_else(|| AppError::Message("path not allowed".into()))?;
    };
    if !is_under(&resolved, &root) || is_blocked_path(&resolved) {
        return Err(AppError::Message("path not allowed".into()));
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
    if text.len() > 2 * 1024 * 1024 {
        return Err(AppError::Message("配置太大".into()));
    }
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
    tokio::fs::write(path, text)
        .await
        .map_err(|e| AppError::Message(e.to_string()))
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
        return Err(AppError::Message("path not allowed".into()));
    };
    if !allow_write(&canon, trusted) {
        return Err(AppError::Message("path not allowed".into()));
    }
    Ok(canon)
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
        std::fs::write(&checked, text).map_err(|e| AppError::Message(e.to_string()))
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
}
