use std::collections::HashMap;

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
            args: vec!["-y".into(), "@agentclientprotocol/claude-agent-acp".into()],
        },
        AgentId::Codex => SpawnProfile {
            command: "npx".into(),
            args: vec!["-y".into(), "@agentclientprotocol/codex-acp".into()],
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
        assert_eq!(claude.args, vec!["-y", "@agentclientprotocol/claude-agent-acp"]);
        let codex = default_spawn_profile(AgentId::Codex);
        assert_eq!(codex.command, "npx");
        assert_eq!(codex.args, vec!["-y", "@agentclientprotocol/codex-acp"]);
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
}
