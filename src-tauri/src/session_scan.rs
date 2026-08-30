use std::fs;
use std::path::Path;

pub struct ScannedSession {
    pub agent_id: String,
    pub id: String,
    pub title: String,
    pub updated_at: String,
    pub dir: String,
    pub cwd: String,
}

pub enum ScanMode {
    ImmediateDirs, // kimi / codex
    Skip,          // claude until ACP session/list or deeper probe
}

pub fn scan_agent_sessions(root: &Path, agent_id: &str, mode: ScanMode) -> Vec<ScannedSession> {
    match mode {
        ScanMode::Skip => Vec::new(),
        ScanMode::ImmediateDirs => expand_nested_sessions(scan_named_subdirs(root, agent_id)),
    }
}

pub fn keep_row_for_cwd(row_cwd: &str, want: &str) -> bool {
    want.is_empty() || row_cwd.is_empty() || row_cwd == want
}

pub fn scan_named_subdirs(root: &Path, agent_id: &str) -> Vec<ScannedSession> {
    if !root.is_dir() {
        return Vec::new();
    }
    let Ok(entries) = fs::read_dir(root) else {
        return Vec::new();
    };
    let mut rows = Vec::new();
    for entry in entries.flatten() {
        let path = entry.path();
        if !path.is_dir() {
            continue;
        }
        let name = entry.file_name();
        let name_str = name.to_string_lossy();
        if name_str.is_empty() || name_str.starts_with('.') {
            continue;
        }
        let updated_at = entry
            .metadata()
            .ok()
            .and_then(|m| m.modified().ok())
            .and_then(|t| t.duration_since(std::time::UNIX_EPOCH).ok())
            .map(|d| d.as_secs().to_string())
            .unwrap_or_default();
        rows.push(ScannedSession {
            agent_id: agent_id.to_string(),
            id: name_str.to_string(),
            title: name_str.to_string(),
            updated_at,
            dir: path.to_string_lossy().to_string(),
            cwd: String::new(),
        });
    }
    rows
}

fn expand_nested_sessions(wrappers: Vec<ScannedSession>) -> Vec<ScannedSession> {
    let mut out = Vec::new();
    for wrapper in wrappers {
        let children = scan_session_children(&wrapper);
        if children.is_empty() {
            out.push(wrapper);
        } else {
            out.extend(children);
        }
    }
    out
}

fn scan_session_children(wrapper: &ScannedSession) -> Vec<ScannedSession> {
    let root = Path::new(&wrapper.dir);
    let Ok(entries) = fs::read_dir(root) else {
        return Vec::new();
    };
    let mut rows = Vec::new();
    for entry in entries.flatten() {
        let path = entry.path();
        if !path.is_dir() {
            continue;
        }
        let name = entry.file_name().to_string_lossy().into_owned();
        if !name.starts_with("session_") {
            continue;
        }
        let meta = read_kimi_state(&path.join("state.json"));
        rows.push(ScannedSession {
            agent_id: wrapper.agent_id.clone(),
            id: name,
            title: meta.title.unwrap_or_else(|| wrapper.title.clone()),
            updated_at: meta.updated_at.unwrap_or_else(|| wrapper.updated_at.clone()),
            dir: path.to_string_lossy().into_owned(),
            cwd: meta.cwd.unwrap_or_default(),
        });
    }
    rows
}

struct KimiStateMeta {
    title: Option<String>,
    cwd: Option<String>,
    updated_at: Option<String>,
}

fn read_kimi_state(path: &Path) -> KimiStateMeta {
    let empty = KimiStateMeta {
        title: None,
        cwd: None,
        updated_at: None,
    };
    let Ok(text) = fs::read_to_string(path) else {
        return empty;
    };
    let Ok(value) = serde_json::from_str::<serde_json::Value>(&text) else {
        return empty;
    };
    let title = value
        .get("title")
        .and_then(|v| v.as_str())
        .map(str::trim)
        .filter(|s| !s.is_empty())
        .map(str::to_string);
    let cwd = value
        .get("workDir")
        .and_then(|v| v.as_str())
        .map(str::trim)
        .filter(|s| !s.is_empty())
        .map(str::to_string);
    let updated_at = match value.get("updatedAt") {
        Some(serde_json::Value::String(s)) if !s.is_empty() => Some(s.clone()),
        Some(serde_json::Value::Number(n)) => Some(n.to_string()),
        _ => None,
    };
    KimiStateMeta {
        title,
        cwd,
        updated_at,
    }
}

#[cfg(test)]
mod tests {
    use super::*;
    use std::fs;
    use std::path::PathBuf;

    fn uniq() -> PathBuf {
        let n = std::time::SystemTime::now()
            .duration_since(std::time::UNIX_EPOCH)
            .unwrap()
            .as_nanos();
        std::env::temp_dir().join(format!("session_scan_test_{n}"))
    }

    #[test]
    fn lists_immediate_dirs_only() {
        let root = uniq();
        fs::create_dir_all(&root).unwrap();
        fs::create_dir_all(root.join("abc")).unwrap();
        fs::create_dir_all(root.join(".hidden")).unwrap();
        fs::write(root.join("file.txt"), "x").unwrap();
        let rows = scan_named_subdirs(&root, "kimi");
        assert_eq!(rows.len(), 1);
        assert_eq!(rows[0].agent_id, "kimi");
        assert_eq!(rows[0].id, "abc");
        fs::remove_dir_all(root).ok();
    }

    #[test]
    fn skip_mode_ignores_claude_project_slug() {
        let root = uniq();
        fs::create_dir_all(root.join("-Users-foxie-project")).unwrap();
        let rows = scan_agent_sessions(&root, "claude", ScanMode::Skip);
        assert!(rows.is_empty());
        fs::remove_dir_all(root).ok();
    }

    #[test]
    fn immediate_dirs_lists_kimi_wd_abc() {
        let root = uniq();
        fs::create_dir_all(root.join("wd_abc")).unwrap();
        let rows = scan_agent_sessions(&root, "kimi", ScanMode::ImmediateDirs);
        assert_eq!(rows.len(), 1);
        assert_eq!(rows[0].id, "wd_abc");
        assert_eq!(rows[0].agent_id, "kimi");
        fs::remove_dir_all(root).ok();
    }

    #[test]
    fn keep_row_for_cwd_keeps_empty_row_and_empty_want() {
        assert!(keep_row_for_cwd("", "/some/project"));
        assert!(!keep_row_for_cwd("/other", "/some/project"));
        assert!(keep_row_for_cwd("/other", ""));
        assert!(keep_row_for_cwd("", ""));
        assert!(keep_row_for_cwd("/some/project", "/some/project"));
    }

    #[test]
    fn kimi_nested_session_reads_state_json() {
        let root = uniq();
        let sid = "session_b42204e6-b461-4912-bb2b-57805a5e5edb";
        let inner = root.join("wd_kimi-smoke").join(sid);
        fs::create_dir_all(&inner).unwrap();
        fs::write(
            inner.join("state.json"),
            r#"{"title":"Kimi smoke","workDir":"/tmp/kimi-smoke","updatedAt":"1710000000"}"#,
        )
        .unwrap();
        let rows = scan_agent_sessions(&root, "kimi", ScanMode::ImmediateDirs);
        assert_eq!(rows.len(), 1);
        assert_eq!(rows[0].id, sid);
        assert_eq!(rows[0].agent_id, "kimi");
        assert_eq!(rows[0].title, "Kimi smoke");
        assert_eq!(rows[0].cwd, "/tmp/kimi-smoke");
        fs::remove_dir_all(root).ok();
    }
}
