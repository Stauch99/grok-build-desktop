use std::collections::HashMap;
use std::path::{Path, PathBuf};

use serde_json::{json, Value};

#[derive(Clone, Copy, PartialEq, Eq, Hash, Debug)]
pub(crate) enum AgentId {
    Grok,
    Kimi,
    Claude,
    Codex,
}

impl AgentId {
    pub(crate) fn as_str(self) -> &'static str {
        match self {
            AgentId::Grok => "grok",
            AgentId::Kimi => "kimi",
            AgentId::Claude => "claude",
            AgentId::Codex => "codex",
        }
    }

    pub(crate) fn parse(s: &str) -> Option<Self> {
        match s {
            "grok" => Some(AgentId::Grok),
            "kimi" => Some(AgentId::Kimi),
            "claude" => Some(AgentId::Claude),
            "codex" => Some(AgentId::Codex),
            _ => None,
        }
    }
}

pub(crate) const CLAUDE_ACP_PKG: &str = "@agentclientprotocol/claude-agent-acp@0.70.0";
pub(crate) const CODEX_ACP_PKG: &str = "@agentclientprotocol/codex-acp@1.7.0";

/// npx adapters ship a nested CLI that often skips optional native binaries.
/// Point them at a PATH-installed `codex` / `claude` when one exists.
pub(crate) fn extra_spawn_env(
    id: AgentId,
    lookup: impl Fn(&str) -> Option<PathBuf>,
) -> Vec<(String, PathBuf)> {
    match id {
        AgentId::Codex => lookup("codex")
            .into_iter()
            .map(|p| ("CODEX_PATH".into(), p))
            .collect(),
        AgentId::Claude => lookup("claude")
            .into_iter()
            .map(|p| ("CLAUDE_CODE_EXECUTABLE".into(), p))
            .collect(),
        AgentId::Grok | AgentId::Kimi => Vec::new(),
    }
}

pub(crate) fn which_search_dirs(path: &str, home: Option<&Path>) -> Vec<PathBuf> {
    let mut dirs: Vec<PathBuf> = path
        .split(':')
        .filter(|d| !d.is_empty())
        .map(PathBuf::from)
        .collect();
    if let Some(home) = home {
        dirs.push(home.join(".local/bin"));
    }
    dirs.push(PathBuf::from("/opt/homebrew/bin"));
    dirs.push(PathBuf::from("/usr/local/bin"));
    dirs
}

pub(crate) fn which_on_path(name: &str) -> Option<PathBuf> {
    let path = std::env::var("PATH").unwrap_or_default();
    let home = std::env::var_os("HOME").map(PathBuf::from);
    for dir in which_search_dirs(&path, home.as_deref()) {
        let candidate = dir.join(name);
        if candidate.is_file() {
            return Some(candidate);
        }
    }
    None
}

#[derive(Clone, Debug, PartialEq, Eq)]
pub(crate) struct SpawnProfile {
    pub command: String,
    pub args: Vec<String>,
}

pub(crate) fn default_spawn_profile(id: AgentId) -> SpawnProfile {
    match id {
        AgentId::Grok => SpawnProfile {
            command: "grok".into(),
            args: vec!["agent".into(), "stdio".into()],
        },
        AgentId::Kimi => SpawnProfile {
            command: "kimi".into(),
            args: vec!["acp".into()],
        },
        AgentId::Claude => SpawnProfile {
            command: "npx".into(),
            args: vec!["-y".into(), CLAUDE_ACP_PKG.into()],
        },
        AgentId::Codex => SpawnProfile {
            command: "npx".into(),
            args: vec!["-y".into(), CODEX_ACP_PKG.into()],
        },
    }
}

#[derive(Default)]
pub(crate) struct AgentPool<T> {
    inner: HashMap<AgentId, T>,
}

impl<T> AgentPool<T> {
    pub(crate) fn new() -> Self {
        Self {
            inner: HashMap::new(),
        }
    }

    pub(crate) fn insert(&mut self, id: AgentId, val: T) -> Option<T> {
        self.inner.insert(id, val)
    }

    pub(crate) fn get(&self, id: AgentId) -> Option<&T> {
        self.inner.get(&id)
    }

    pub(crate) fn get_mut(&mut self, id: AgentId) -> Option<&mut T> {
        self.inner.get_mut(&id)
    }

    pub(crate) fn remove(&mut self, id: AgentId) -> Option<T> {
        self.inner.remove(&id)
    }

    pub(crate) fn contains(&self, id: AgentId) -> bool {
        self.inner.contains_key(&id)
    }

    pub(crate) fn len(&self) -> usize {
        self.inner.len()
    }

    pub(crate) fn is_empty(&self) -> bool {
        self.inner.is_empty()
    }

    pub(crate) fn drain(&mut self) -> Vec<(AgentId, T)> {
        self.inner.drain().collect()
    }
}

pub(crate) fn stamp_agent_id(raw: Option<&str>) -> AgentId {
    raw.and_then(AgentId::parse).unwrap_or(AgentId::Grok)
}

pub(crate) fn parse_agent_id_arg(s: Option<&str>) -> Result<AgentId, String> {
    match s.map(str::trim).filter(|v| !v.is_empty()) {
        None => Ok(AgentId::Grok),
        Some(v) => AgentId::parse(v).ok_or_else(|| format!("未知 agent: {v}")),
    }
}

pub(crate) fn tagged_acp_event(agent_id: AgentId, generation: u64, payload: Value) -> Value {
    json!({
        "agentId": agent_id.as_str(),
        "generation": generation,
        "payload": payload,
    })
}

#[derive(Debug, PartialEq, Eq)]
pub(crate) enum AcpStdioLine {
    Skip,
    Request,
    Message,
    Log,
}

pub(crate) fn classify_acp_stdio_line(line: &str) -> AcpStdioLine {
    let trimmed = line.trim();
    if trimmed.is_empty() {
        return AcpStdioLine::Skip;
    }
    match serde_json::from_str::<Value>(trimmed) {
        Ok(v) if v.get("method").is_some() && v.get("id").is_some() => AcpStdioLine::Request,
        Ok(_) => AcpStdioLine::Message,
        Err(_) => AcpStdioLine::Log,
    }
}

#[derive(Debug, PartialEq)]
pub(crate) enum ParsedStdio {
    Skip,
    Request(Value),
    Message(Value),
    Log(String),
}

pub(crate) fn parse_stdout_line(line: &str) -> ParsedStdio {
    match classify_acp_stdio_line(line) {
        AcpStdioLine::Skip => ParsedStdio::Skip,
        AcpStdioLine::Request => match serde_json::from_str(line.trim()) {
            Ok(v) => ParsedStdio::Request(v),
            Err(_) => ParsedStdio::Log(line.to_string()),
        },
        AcpStdioLine::Message => match serde_json::from_str(line.trim()) {
            Ok(v) => ParsedStdio::Message(v),
            Err(_) => ParsedStdio::Log(line.to_string()),
        },
        AcpStdioLine::Log => ParsedStdio::Log(line.to_string()),
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn agent_id_parse_is_closed() {
        assert_eq!(AgentId::parse("grok"), Some(AgentId::Grok));
        assert_eq!(AgentId::parse("kimi"), Some(AgentId::Kimi));
        assert_eq!(AgentId::parse("claude"), Some(AgentId::Claude));
        assert_eq!(AgentId::parse("codex"), Some(AgentId::Codex));
        assert_eq!(AgentId::parse("Grok"), None);
        assert_eq!(AgentId::parse("gemini"), None);
        assert_eq!(AgentId::Grok.as_str(), "grok");
    }

    #[test]
    fn default_spawn_profile_matches_desktop_table() {
        let grok = default_spawn_profile(AgentId::Grok);
        assert_eq!(grok.command, "grok");
        assert_eq!(grok.args, vec!["agent", "stdio"]);
        let kimi = default_spawn_profile(AgentId::Kimi);
        assert_eq!(kimi.command, "kimi");
        assert_eq!(kimi.args, vec!["acp"]);
        let claude = default_spawn_profile(AgentId::Claude);
        assert_eq!(claude.command, "npx");
        assert_eq!(claude.args, vec!["-y", CLAUDE_ACP_PKG]);
        let codex = default_spawn_profile(AgentId::Codex);
        assert_eq!(codex.command, "npx");
        assert_eq!(codex.args, vec!["-y", CODEX_ACP_PKG]);
    }

    #[test]
    fn pool_insert_get_remove() {
        let mut pool = AgentPool::new();
        assert!(pool.is_empty());
        assert_eq!(pool.insert(AgentId::Grok, 1), None);
        assert_eq!(pool.insert(AgentId::Grok, 2), Some(1));
        assert_eq!(pool.get(AgentId::Grok), Some(&2));
        assert!(pool.contains(AgentId::Grok));
        assert_eq!(pool.len(), 1);
        *pool.get_mut(AgentId::Grok).unwrap() = 3;
        assert_eq!(pool.remove(AgentId::Grok), Some(3));
        assert!(pool.get(AgentId::Grok).is_none());
        assert!(pool.is_empty());
    }

    #[test]
    fn stamps_missing_as_grok() {
        assert_eq!(stamp_agent_id(None), AgentId::Grok);
        assert_eq!(stamp_agent_id(Some("claude")), AgentId::Claude);
        assert_eq!(stamp_agent_id(Some("nope")), AgentId::Grok);
    }

    #[test]
    fn which_search_dirs_includes_homebrew_and_user_local() {
        let dirs = which_search_dirs("/usr/bin", Some(Path::new("/Users/me")));
        assert!(dirs.contains(&PathBuf::from("/usr/bin")));
        assert!(dirs.contains(&PathBuf::from("/Users/me/.local/bin")));
        assert!(dirs.contains(&PathBuf::from("/opt/homebrew/bin")));
    }

    #[test]
    fn extra_spawn_env_points_npx_adapters_at_native_clis() {
        use std::path::PathBuf;
        let lookup = |name: &str| match name {
            "codex" => Some(PathBuf::from("/opt/homebrew/bin/codex")),
            "claude" => Some(PathBuf::from("/Users/me/.local/bin/claude")),
            _ => None,
        };
        assert_eq!(
            extra_spawn_env(AgentId::Codex, lookup),
            vec![("CODEX_PATH".into(), PathBuf::from("/opt/homebrew/bin/codex"))]
        );
        assert_eq!(
            extra_spawn_env(AgentId::Claude, lookup),
            vec![("CLAUDE_CODE_EXECUTABLE".into(), PathBuf::from("/Users/me/.local/bin/claude"))]
        );
        assert!(extra_spawn_env(AgentId::Grok, lookup).is_empty());
        assert!(extra_spawn_env(AgentId::Kimi, lookup).is_empty());
        assert!(extra_spawn_env(AgentId::Codex, |_| None).is_empty());
    }

    #[test]
    fn parse_agent_id_arg_defaults_to_grok() {
        assert_eq!(parse_agent_id_arg(None).unwrap(), AgentId::Grok);
        assert_eq!(parse_agent_id_arg(Some("")).unwrap(), AgentId::Grok);
        assert_eq!(parse_agent_id_arg(Some("  ")).unwrap(), AgentId::Grok);
        assert_eq!(parse_agent_id_arg(Some("claude")).unwrap(), AgentId::Claude);
        let err = parse_agent_id_arg(Some("gemini")).unwrap_err();
        assert!(err.contains("未知 agent"));
    }

    #[test]
    fn tagged_acp_event_envelope() {
        let v = tagged_acp_event(AgentId::Kimi, 4, serde_json::json!({"jsonrpc":"2.0"}));
        assert_eq!(v["agentId"], "kimi");
        assert_eq!(v["generation"], 4);
        assert_eq!(v["payload"]["jsonrpc"], "2.0");
    }

    #[test]
    fn pool_drain_empties() {
        let mut pool = AgentPool::new();
        pool.insert(AgentId::Grok, 1);
        pool.insert(AgentId::Kimi, 2);
        let mut pairs = pool.drain();
        pairs.sort_by_key(|(id, _)| id.as_str());
        assert_eq!(pairs, vec![(AgentId::Grok, 1), (AgentId::Kimi, 2)]);
        assert!(pool.is_empty());
    }

    #[test]
    fn classify_acp_stdio_line_cases() {
        assert_eq!(classify_acp_stdio_line(""), AcpStdioLine::Skip);
        assert_eq!(classify_acp_stdio_line("   \n"), AcpStdioLine::Skip);
        assert_eq!(
            classify_acp_stdio_line(r#"{"method":"x","id":1}"#),
            AcpStdioLine::Request
        );
        assert_eq!(
            classify_acp_stdio_line(r#"{"jsonrpc":"2.0","result":{}}"#),
            AcpStdioLine::Message
        );
        assert_eq!(classify_acp_stdio_line("not json"), AcpStdioLine::Log);
    }

    #[test]
    fn parse_stdout_line_routes_classifier() {
        assert_eq!(parse_stdout_line(""), ParsedStdio::Skip);
        assert_eq!(
            parse_stdout_line(r#"{"method":"x","id":1}"#),
            ParsedStdio::Request(json!({"method":"x","id":1}))
        );
        assert_eq!(
            parse_stdout_line(r#"{"jsonrpc":"2.0","result":{}}"#),
            ParsedStdio::Message(json!({"jsonrpc":"2.0","result":{}}))
        );
        assert_eq!(parse_stdout_line("not json"), ParsedStdio::Log("not json".into()));
    }
}
