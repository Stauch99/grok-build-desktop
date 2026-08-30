use std::path::{Path, PathBuf};

use crate::agent_host::{AgentId, CLAUDE_ACP_PKG, CODEX_ACP_PKG};

pub(crate) fn agents_toml_path(workbench_home: &Path) -> PathBuf {
    workbench_home.join("agents.toml")
}

pub(crate) fn default_agents_toml() -> String {
    format!(
        r#"[agents.grok]
enabled = true
command = ""
args = ["agent", "stdio"]
home = ""
login = ["login"]

[agents.kimi]
enabled = true
command = "kimi"
args = ["acp"]
home = ""
login = ["login"]

[agents.claude]
enabled = true
command = "npx"
args = ["-y", "{claude}"]
home = ""
login = ["login"]

[agents.codex]
enabled = true
command = "npx"
args = ["-y", "{codex}"]
home = ""
login = ["login"]
"#,
        claude = CLAUDE_ACP_PKG,
        codex = CODEX_ACP_PKG,
    )
}

pub(crate) fn should_write_default_registry(exists: bool) -> bool {
    !exists
}

pub(crate) fn pinned_npx_pkg(id: AgentId) -> Option<&'static str> {
    match id {
        AgentId::Claude => Some(CLAUDE_ACP_PKG),
        AgentId::Codex => Some(CODEX_ACP_PKG),
        AgentId::Grok | AgentId::Kimi => None,
    }
}

pub(crate) fn spawn_args_from_toml(doc: &str, id: AgentId) -> Option<(String, Vec<String>)> {
    let parsed = doc.parse::<toml_edit::DocumentMut>().ok()?;
    let table = parsed.get("agents")?.as_table()?.get(id.as_str())?.as_table()?;
    let command = table
        .get("command")
        .and_then(|v| v.as_str())
        .unwrap_or("")
        .to_string();
    let args = table.get("args")?.as_array()?.iter().filter_map(|v| v.as_str().map(str::to_string)).collect();
    Some((command, args))
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn default_toml_pins_npm_adapters() {
        let text = default_agents_toml();
        assert!(text.contains(CLAUDE_ACP_PKG));
        assert!(text.contains(CODEX_ACP_PKG));
        assert!(!text.contains("@latest"));
        let claude = spawn_args_from_toml(&text, AgentId::Claude).unwrap();
        assert_eq!(claude.0, "npx");
        assert_eq!(claude.1, vec!["-y".to_string(), CLAUDE_ACP_PKG.to_string()]);
        let kimi = spawn_args_from_toml(&text, AgentId::Kimi).unwrap();
        assert_eq!(kimi, ("kimi".into(), vec!["acp".into()]));
    }

    #[test]
    fn registry_path_and_write_gate() {
        assert_eq!(
            agents_toml_path(Path::new("/Users/me/.acp-workbench")),
            PathBuf::from("/Users/me/.acp-workbench/agents.toml")
        );
        assert!(should_write_default_registry(false));
        assert!(!should_write_default_registry(true));
        assert_eq!(pinned_npx_pkg(AgentId::Claude), Some(CLAUDE_ACP_PKG));
        assert_eq!(pinned_npx_pkg(AgentId::Grok), None);
    }
}
