use crate::agent_host::AgentId;

pub enum CatalogKind {
    GrokSummary,
    KimiSessions,
    ClaudeJsonl,
    CodexRollouts,
}

pub struct AgentManifest {
    pub id: AgentId,
    pub catalog: CatalogKind,
    pub home_rel: &'static str,
    pub subagent_aliases: &'static [&'static str],
    pub initialize_timeout_ms: u64,
}

const DEFAULT_ALIASES: &[&str] = &[
    "spawn_subagent",
    "get_command_or_subagent_output",
    "task",
    "agent",
];

const KIMI_ALIASES: &[&str] = &[
    "spawn_subagent",
    "get_command_or_subagent_output",
    "task",
    "agent",
    "swarm",
];

pub fn manifest(id: AgentId) -> AgentManifest {
    match id {
        AgentId::Grok => AgentManifest {
            id: AgentId::Grok,
            catalog: CatalogKind::GrokSummary,
            home_rel: ".grok",
            subagent_aliases: DEFAULT_ALIASES,
            initialize_timeout_ms: 20_000,
        },
        AgentId::Kimi => AgentManifest {
            id: AgentId::Kimi,
            catalog: CatalogKind::KimiSessions,
            home_rel: ".kimi-code",
            subagent_aliases: KIMI_ALIASES,
            initialize_timeout_ms: 20_000,
        },
        AgentId::Claude => AgentManifest {
            id: AgentId::Claude,
            catalog: CatalogKind::ClaudeJsonl,
            home_rel: ".claude",
            subagent_aliases: DEFAULT_ALIASES,
            initialize_timeout_ms: 20_000,
        },
        AgentId::Codex => AgentManifest {
            id: AgentId::Codex,
            catalog: CatalogKind::CodexRollouts,
            home_rel: ".codex",
            subagent_aliases: DEFAULT_ALIASES,
            initialize_timeout_ms: 20_000,
        },
    }
}

#[cfg(test)]
mod tests {
    use crate::agent_host::AgentId;

    use super::{manifest, CatalogKind};

    #[test]
    fn builtin_manifests_cover_four_ids() {
        assert_eq!(manifest(AgentId::Claude).home_rel, ".claude");
        assert_eq!(manifest(AgentId::Claude).initialize_timeout_ms, 20_000);
        assert!(manifest(AgentId::Kimi).subagent_aliases.contains(&"swarm"));
        assert!(matches!(manifest(AgentId::Claude).catalog, CatalogKind::ClaudeJsonl));
        assert!(matches!(manifest(AgentId::Grok).catalog, CatalogKind::GrokSummary));
        assert_eq!(manifest(AgentId::Kimi).home_rel, ".kimi-code");
        assert_eq!(manifest(AgentId::Codex).home_rel, ".codex");
    }
}
