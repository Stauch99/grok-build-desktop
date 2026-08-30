use std::path::{Path, PathBuf};

pub(crate) fn sessions_for(id: crate::agent_host::AgentId, grok: Vec<String>) -> Vec<String> {
    match id {
        crate::agent_host::AgentId::Grok => grok,
        crate::agent_host::AgentId::Kimi
        | crate::agent_host::AgentId::Claude
        | crate::agent_host::AgentId::Codex => Vec::new(),
    }
}

pub(crate) fn doctor_homes(
    user_home: &Path,
    grok_home: &Path,
) -> [(&'static str, PathBuf); 4] {
    [
        ("grok", grok_home.to_path_buf()),
        ("kimi", user_home.join(".kimi-code")),
        ("claude", user_home.join(".claude")),
        ("codex", user_home.join(".codex")),
    ]
}

#[cfg(test)]
mod tests {
    use super::*;
    use crate::agent_host::AgentId;
    use std::path::Path;

    #[test]
    fn other_adapters_have_no_sessions_yet() {
        let grok = vec!["s1".into()];
        assert_eq!(sessions_for(AgentId::Grok, grok.clone()), grok);
        assert!(sessions_for(AgentId::Kimi, grok.clone()).is_empty());
        assert!(sessions_for(AgentId::Claude, grok.clone()).is_empty());
        assert!(sessions_for(AgentId::Codex, grok).is_empty());
        let homes = doctor_homes(Path::new("/Users/me"), Path::new("/Users/me/.grok"));
        assert_eq!(homes[0], ("grok", PathBuf::from("/Users/me/.grok")));
        assert_eq!(homes[1], ("kimi", PathBuf::from("/Users/me/.kimi-code")));
        assert_eq!(homes[2], ("claude", PathBuf::from("/Users/me/.claude")));
        assert_eq!(homes[3], ("codex", PathBuf::from("/Users/me/.codex")));
    }
}
