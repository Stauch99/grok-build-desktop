use std::path::{Path, PathBuf};

pub(crate) fn agents_file_path(
    user_home: &Path,
    agents_home: &Path,
    kind: &str,
) -> Option<PathBuf> {
    match kind {
        "mcp-json" => Some(agents_home.join("mcp.json")),
        "sync-json" => Some(agents_home.join("sync.json")),
        "claude-json" => Some(user_home.join(".claude.json")),
        "kimi-mcp" => Some(user_home.join(".kimi-code").join("mcp.json")),
        "grok-toml" => Some(user_home.join(".grok").join("config.toml")),
        "codex-toml" => Some(user_home.join(".codex").join("config.toml")),
        _ => None,
    }
}

pub(crate) fn read_agents_file_text(path: &Path) -> String {
    std::fs::read_to_string(path).unwrap_or_default()
}

pub(crate) fn write_agents_file_text(path: &Path, text: &str) -> Result<(), String> {
    if let Some(parent) = path.parent() {
        std::fs::create_dir_all(parent).map_err(|e| e.to_string())?;
    }
    std::fs::write(path, text).map_err(|e| e.to_string())
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn maps_known_kinds_only() {
        let home = Path::new("/Users/me");
        let agents = Path::new("/Users/me/.agents");
        assert_eq!(
            agents_file_path(home, agents, "mcp-json"),
            Some(PathBuf::from("/Users/me/.agents/mcp.json"))
        );
        assert_eq!(
            agents_file_path(home, agents, "claude-json"),
            Some(PathBuf::from("/Users/me/.claude.json"))
        );
        assert_eq!(
            agents_file_path(home, agents, "codex-toml"),
            Some(PathBuf::from("/Users/me/.codex/config.toml"))
        );
        assert_eq!(agents_file_path(home, agents, "nope"), None);
    }

    #[test]
    fn read_returns_empty_when_missing() {
        let missing = Path::new("/tmp/agents_files_test_missing_should_not_exist");
        assert_eq!(read_agents_file_text(missing), "");
    }

    #[test]
    fn write_creates_parent_dirs() {
        let dir = std::env::temp_dir().join(format!(
            "agents_files_test_{}",
            std::process::id()
        ));
        let path = dir.join("nested").join("mcp.json");
        let _ = std::fs::remove_dir_all(&dir);
        write_agents_file_text(&path, r#"{"servers":[]}"#).expect("write");
        assert_eq!(read_agents_file_text(&path), r#"{"servers":[]}"#);
        let _ = std::fs::remove_dir_all(&dir);
    }
}
