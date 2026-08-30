use std::fs;
use std::path::Path;

pub struct ScannedSession {
    pub agent_id: String,
    pub id: String,
    pub title: String,
    pub updated_at: String,
    pub dir: String,
}

pub enum ScanMode {
    ImmediateDirs, // kimi / codex
    Skip,          // claude until ACP session/list or deeper probe
}

pub fn scan_agent_sessions(root: &Path, agent_id: &str, mode: ScanMode) -> Vec<ScannedSession> {
    match mode {
        ScanMode::Skip => Vec::new(),
        ScanMode::ImmediateDirs => scan_named_subdirs(root, agent_id),
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
        });
    }
    rows
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
}
