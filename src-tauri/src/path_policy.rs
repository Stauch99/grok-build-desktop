//! Path allow/deny policy for preview, ACP fs, open_path, and Review.
use std::path::{Path, PathBuf};

use crate::{dirs_home, grok_home, AppError, AppResult};

/// Asset-protocol deny globs. Must match `tauri.conf.json` `assetProtocol.scope.deny`
/// and `src/lib/csp.test.ts`.
pub(crate) const ASSET_SECRET_DENY: &[&str] = &[
    "$HOME/.ssh/**",
    "$HOME/.gnupg/**",
    "$HOME/.aws/**",
    "$HOME/.grok/auth.json",
    "$HOME/.config/**",
    "$HOME/.kube/**",
    "$HOME/.netrc",
    "$HOME/.npmrc",
    "$HOME/Library/Keychains/**",
    "$HOME/.codex/auth.json",
    "$HOME/.claude.json",
    "$HOME/.kimi-code/credentials/**",
    "$HOME/.git-credentials",
    "$HOME/.docker/config.json",
];

const _: usize = ASSET_SECRET_DENY.len();

pub(crate) fn blocked_secret_paths(home: &Path) -> Vec<PathBuf> {
    vec![
        home.join(".ssh"),
        home.join(".gnupg"),
        home.join(".aws"),
        home.join(".config"),
        home.join(".kube"),
        home.join(".netrc"),
        home.join(".npmrc"),
        home.join("Library").join("Keychains"),
        grok_home().join("auth.json"),
        home.join(".codex").join("auth.json"),
        home.join(".claude.json"),
        home.join(".kimi-code").join("credentials"),
        home.join(".git-credentials"),
        home.join(".docker").join("config.json"),
    ]
}

fn is_credential_filename(path: &Path) -> bool {
    let name = path.file_name().and_then(|n| n.to_str()).unwrap_or("");
    matches!(
        name,
        "auth.json"
            | "credentials.json"
            | ".credentials.json"
            | "kimi-code.json"
            | ".git-credentials"
    )
}

pub(crate) fn is_blocked_path(path: &Path) -> bool {
    let home = dirs_home();
    blocked_secret_paths(&home)
        .iter()
        .any(|d| path == d || path.starts_with(d))
}

#[derive(Clone, Copy)]
pub(crate) enum PathAccess {
    Read,
    Write,
}

fn has_parent_traversal(path: &Path) -> bool {
    path.components()
        .any(|component| matches!(component, std::path::Component::ParentDir))
}

fn resolve_with_existing_ancestor(requested: &Path) -> Result<PathBuf, String> {
    let mut ancestor = requested;
    let mut suffix = Vec::new();
    while !ancestor.exists() {
        let name = ancestor
            .file_name()
            .ok_or_else(|| "path has no existing ancestor".to_string())?;
        suffix.push(name.to_os_string());
        ancestor = ancestor
            .parent()
            .ok_or_else(|| "path has no existing ancestor".to_string())?;
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

pub(crate) fn trusted_workspace_for_hint(
    workspace: Option<&Path>,
    hint: Option<&str>,
) -> Result<PathBuf, String> {
    let root = workspace
        .ok_or_else(|| "trusted workspace is not set".to_string())?
        .canonicalize()
        .map_err(|e| e.to_string())?;
    if root == Path::new("/") || is_blocked_path(&root) {
        return Err("trusted workspace is invalid".into());
    }
    if let Some(raw) = hint.filter(|value| !value.trim().is_empty()) {
        let hinted = PathBuf::from(raw)
            .canonicalize()
            .map_err(|e| e.to_string())?;
        if hinted == Path::new("/") || is_blocked_path(&hinted) {
            return Err("caller workspace does not match trusted workspace".into());
        }
        if let Ok(home) = dirs_home().canonicalize() {
            if hinted == home {
                return Err("caller workspace does not match trusted workspace".into());
            }
        }
        if let Some(mem) = workbench_memory_root() {
            if same_dir(&hinted, &mem) || is_under(&hinted, &mem) {
                // Founding/dream files live under the workbench memory host, not the
                // project cwd. Scope the write capability to that host only.
                return Ok(mem);
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

fn workbench_memory_root() -> Option<PathBuf> {
    let mem = crate::memory_host::memory_root();
    Some(mem.canonicalize().unwrap_or(mem))
}

pub(crate) fn trusted_desktop_root(
    workspace: Option<&Path>,
    hint: Option<&str>,
) -> Result<Option<PathBuf>, String> {
    let hint = hint.map(str::trim).filter(|value| !value.is_empty());
    if workspace.is_none() && hint.is_none() {
        return Ok(None);
    }
    trusted_workspace_for_hint(workspace, hint).map(Some)
}

pub(crate) fn resolve_allowed_path(
    raw: &str,
    workspace: Option<&Path>,
    access: PathAccess,
) -> Result<PathBuf, String> {
    if raw.is_empty() {
        return Err("empty path".into());
    }
    let requested = PathBuf::from(raw);
    if !requested.is_absolute() {
        return Err("path must be absolute".into());
    }
    if has_parent_traversal(&requested) {
        return Err("parent traversal is not allowed".into());
    }
    let canon = match access {
        PathAccess::Read => requested.canonicalize().map_err(|e| e.to_string())?,
        PathAccess::Write => resolve_with_existing_ancestor(&requested)?,
    };
    if is_blocked_path(&canon) {
        return Err("path is blocked".into());
    }
    if matches!(access, PathAccess::Write) {
        if extra_agent_write_root(&canon) {
            return Ok(canon);
        }
        let root = workspace
            .ok_or_else(|| "trusted workspace is not set".to_string())?
            .canonicalize()
            .map_err(|e| e.to_string())?;
        if root == Path::new("/") || is_blocked_path(&root) {
            return Err("trusted workspace is invalid".into());
        }
        if !canon.starts_with(&root) {
            return Err("path is outside the workspace".into());
        }
        return Ok(canon);
    }
    let allow_root = match workspace {
        Some(root) => Some(root.canonicalize().map_err(|e| e.to_string())?),
        None => None,
    };
    if !allow_acp_read(&canon, allow_root.as_deref()) {
        return Err("path is outside the workspace".into());
    }
    Ok(canon)
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
    [
        "/tmp",
        "/private/tmp",
        "/var/folders",
        "/private/var/folders",
    ]
    .iter()
    .any(|root| is_under(canon, Path::new(root)))
}

pub(crate) fn allow_text_read_candidate(canon: &Path, allow_root: Option<&Path>, is_file: bool) -> bool {
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
    false
}

pub(crate) fn allow_text_read(canon: &Path, allow_root: Option<&Path>) -> bool {
    allow_text_read_candidate(canon, allow_root, canon.is_file())
}

/// ACP reads follow the preview allowlist, plus user skill/agent homes that
/// live outside the project (`~/.agents`, `~/.grok`, and the same roots other CLIs use).
pub(crate) fn extra_skill_read_root(canon: &Path) -> bool {
    if is_blocked_path(canon) || !canon.is_file() || is_credential_filename(canon) {
        return false;
    }
    let home = dirs_home();
    let roots = [
        home.join(".agents"),
        home.join(".claude"),
        home.join(".codex"),
        home.join(".kimi-code"),
        grok_home(),
    ];
    roots.iter().any(|root| {
        if let Ok(root) = root.canonicalize() {
            is_under(canon, &root)
        } else {
            is_under(canon, root)
        }
    })
}

fn extra_agent_write_root(canon: &Path) -> bool {
    if is_blocked_path(canon) {
        return false;
    }
    let home = dirs_home();
    let roots = [
        home.join(".agents"),
        grok_home().join("memory"),
        grok_home().join("skills"),
        crate::memory_host::memory_root(),
    ];
    roots.iter().any(|root| {
        if let Ok(root) = root.canonicalize() {
            is_under(canon, &root)
        } else {
            canon.starts_with(root)
        }
    })
}

fn allow_acp_read(canon: &Path, allow_root: Option<&Path>) -> bool {
    allow_text_read(canon, allow_root) || extra_skill_read_root(canon)
}

/// True when `explorer` would treat `target` as a switch (`/select`, `/e`) rather than a path.
pub(crate) fn explorer_slash_switch(target: &str) -> bool {
    let t = target.trim();
    if t.starts_with("//") {
        return false;
    }
    let Some(rest) = t.strip_prefix('/') else {
        return false;
    };
    rest.as_bytes().get(1) != Some(&b':')
}

pub(crate) fn open_path_arg_rejected(trimmed: &str) -> bool {
    if trimmed.is_empty() || trimmed.starts_with('-') {
        return true;
    }
    cfg!(target_os = "windows") && explorer_slash_switch(trimmed)
}

fn path_looks_like_app_or_executable(path: &Path) -> bool {
    let lower = path.to_string_lossy().to_lowercase();
    if lower
        .split(['/', '\\'])
        .any(|part| part.ends_with(".app") || part.ends_with(".command"))
    {
        return true;
    }
    matches!(
        path.extension()
            .and_then(|v| v.to_str())
            .map(str::to_ascii_lowercase)
            .as_deref(),
        Some("exe" | "com" | "bat" | "cmd" | "appimage" | "desktop" | "command")
    )
}

fn unix_executable_mode(path: &Path) -> bool {
    #[cfg(unix)]
    {
        std::fs::symlink_metadata(path)
            .map(|m| {
                use std::os::unix::fs::PermissionsExt;
                m.permissions().mode() & 0o111 != 0
            })
            .unwrap_or(false)
    }
    #[cfg(not(unix))]
    {
        let _ = path;
        false
    }
}

/// Local `open_path` targets: blocked secrets, apps, and executables stay closed.
pub(crate) fn open_path_local_rejected(target: &str) -> bool {
    if target.starts_with("http://") || target.starts_with("https://") {
        return false;
    }
    let path = Path::new(target);
    is_blocked_path(path) || path_looks_like_app_or_executable(path) || unix_executable_mode(path)
}

fn reject_symlink(path: &Path) -> AppResult<()> {
    let meta = std::fs::symlink_metadata(path)
        .map_err(|_| AppError::Message("Review 目标不存在".into()))?;
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
        let lstat = std::fs::symlink_metadata(path)
            .map_err(|_| AppError::Message("Review 目标不存在".into()))?;
        let followed =
            std::fs::metadata(path).map_err(|_| AppError::Message("Review 目标不存在".into()))?;
        if lstat.dev() != followed.dev() || lstat.ino() != followed.ino() {
            return Err(AppError::Message("Review 目标不能是符号链接".into()));
        }
    }
    Ok(())
}

pub(crate) fn validate_review_open_target(
    path: &str,
    workspace: Option<&Path>,
    hint: &str,
) -> AppResult<PathBuf> {
    let trimmed = path.trim();
    if trimmed.is_empty() || trimmed.contains("://") || trimmed.starts_with('-') {
        return Err(AppError::Message("Review 目标不安全".into()));
    }
    let root = trusted_workspace_for_hint(workspace, Some(hint)).map_err(AppError::Message)?;
    let requested = PathBuf::from(trimmed);
    if has_parent_traversal(&requested) {
        return Err(AppError::Message("Review 目标不在当前工作区".into()));
    }
    let unfollowed = if requested.is_absolute() {
        requested
    } else {
        root.join(requested)
    };
    if is_blocked_path(&unfollowed) || !is_under(&unfollowed, &root) {
        return Err(AppError::Message("Review 目标不在当前工作区".into()));
    }
    confirm_unfollowed(&unfollowed)?;
    let target = unfollowed
        .canonicalize()
        .map_err(|_| AppError::Message("Review 目标不存在".into()))?;
    if is_blocked_path(&target) || !is_under(&target, &root) {
        return Err(AppError::Message("Review 目标不在当前工作区".into()));
    }
    confirm_unfollowed(&unfollowed)?;
    if path_looks_like_app_or_executable(&unfollowed) {
        return Err(AppError::Message(
            "Review 不允许打开应用或可执行文件".into(),
        ));
    }
    if unix_executable_mode(&unfollowed) {
        return Err(AppError::Message("Review 不允许打开可执行文件".into()));
    }
    Ok(unfollowed)
}
