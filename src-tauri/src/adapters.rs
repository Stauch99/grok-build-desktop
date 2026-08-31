use std::path::{Path, PathBuf};

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

pub(crate) fn spawn_argv(
    id: crate::agent_host::AgentId,
    grok_bin: Option<&Path>,
    registry_toml: Option<&str>,
) -> Option<(PathBuf, Vec<String>)> {
    if let Some(text) = registry_toml {
        if let Some((cmd, args)) = crate::agent_registry::spawn_args_from_toml(text, id) {
            if let Some(resolved) = resolve_spawn_cmd(id, grok_bin, cmd, args) {
                return Some(resolved);
            }
        }
    }
    spawn_argv_builtin(id, grok_bin)
}

fn resolve_spawn_cmd(
    id: crate::agent_host::AgentId,
    grok_bin: Option<&Path>,
    cmd: String,
    args: Vec<String>,
) -> Option<(PathBuf, Vec<String>)> {
    let cmd = cmd.trim();
    if cmd.is_empty() {
        let args = if args.is_empty() {
            vec!["agent".into(), "stdio".into()]
        } else {
            args
        };
        return grok_bin.map(|p| (p.to_path_buf(), args));
    }
    if cmd == "npx" {
        let pkg = crate::agent_registry::pinned_npx_pkg(id)
            .map(str::to_string)
            .or_else(|| args.iter().find(|a| a.contains('@')).cloned())
            .or_else(|| args.get(1).cloned())?;
        return Some(crate::agent_host::spawn_npx_adapter(
            &pkg,
            &crate::agent_host::default_npx_root(),
            crate::agent_host::which_on_path,
        ));
    }
    Some((PathBuf::from(cmd), args))
}

fn spawn_argv_builtin(
    id: crate::agent_host::AgentId,
    grok_bin: Option<&Path>,
) -> Option<(PathBuf, Vec<String>)> {
    use crate::agent_host::AgentId;
    match id {
        AgentId::Grok => grok_bin.map(|p| (p.to_path_buf(), vec!["agent".into(), "stdio".into()])),
        AgentId::Kimi => {
            let p = crate::agent_host::default_spawn_profile(AgentId::Kimi);
            Some((PathBuf::from(p.command), p.args))
        }
        AgentId::Claude | AgentId::Codex => {
            let p = crate::agent_host::default_spawn_profile(id);
            let pkg = crate::agent_registry::pinned_npx_pkg(id)
                .map(str::to_string)
                .or_else(|| p.args.get(1).cloned())
                .unwrap_or_default();
            Some(crate::agent_host::spawn_npx_adapter(
                &pkg,
                &crate::agent_host::default_npx_root(),
                crate::agent_host::which_on_path,
            ))
        }
    }
}

#[cfg(test)]
mod tests {
    use super::*;
    use crate::agent_host::AgentId;
    use std::path::Path;

    #[test]
    fn doctor_homes_maps_four_cli_roots() {
        let homes = doctor_homes(Path::new("/Users/me"), Path::new("/Users/me/.grok"));
        assert_eq!(homes[0], ("grok", PathBuf::from("/Users/me/.grok")));
        assert_eq!(homes[1], ("kimi", PathBuf::from("/Users/me/.kimi-code")));
        assert_eq!(homes[2], ("claude", PathBuf::from("/Users/me/.claude")));
        assert_eq!(homes[3], ("codex", PathBuf::from("/Users/me/.codex")));
    }

    #[test]
    fn spawn_argv_per_adapter() {
        let grok_bin = PathBuf::from("/Users/me/.grok/bin/grok");
        assert_eq!(
            spawn_argv(AgentId::Grok, Some(&grok_bin), None),
            Some((grok_bin.clone(), vec!["agent".into(), "stdio".into()]))
        );
        assert_eq!(spawn_argv(AgentId::Grok, None, None), None);
        let (cmd, args) = spawn_argv(AgentId::Kimi, None, None).unwrap();
        assert_eq!(cmd, PathBuf::from("kimi"));
        assert_eq!(args, vec!["acp".to_string()]);
        let empty = Path::new("/no/such/npx-cache");
        let (cmd, args) = crate::agent_host::spawn_npx_adapter(
            crate::agent_host::CLAUDE_ACP_PKG,
            empty,
            |_| None,
        );
        assert_eq!(cmd, PathBuf::from("npx"));
        assert_eq!(
            args,
            vec!["-y".to_string(), crate::agent_host::CLAUDE_ACP_PKG.to_string()]
        );
        let (cmd, args) = crate::agent_host::spawn_npx_adapter(
            crate::agent_host::CODEX_ACP_PKG,
            empty,
            |_| None,
        );
        assert_eq!(cmd, PathBuf::from("npx"));
        assert_eq!(
            args,
            vec!["-y".to_string(), crate::agent_host::CODEX_ACP_PKG.to_string()]
        );
    }

    #[test]
    fn spawn_argv_reads_agents_toml() {
        let grok_bin = PathBuf::from("/Users/me/.grok/bin/grok");
        let text = crate::agent_registry::default_agents_toml();
        let (cmd, args) = spawn_argv(AgentId::Grok, Some(&grok_bin), Some(&text)).unwrap();
        assert_eq!(cmd, grok_bin);
        assert_eq!(args, vec!["agent".to_string(), "stdio".to_string()]);
        let (cmd, args) = spawn_argv(AgentId::Kimi, None, Some(&text)).unwrap();
        assert_eq!(cmd, PathBuf::from("kimi"));
        assert_eq!(args, vec!["acp".to_string()]);
        let (cmd, args) = spawn_argv(AgentId::Claude, None, Some(&text)).unwrap();
        assert!(
            args.iter().any(|a| a.contains(crate::agent_host::CLAUDE_ACP_PKG)
                || a.contains("claude-agent-acp")),
            "claude spawn should pin the ACP package, got {cmd:?} {args:?}"
        );
    }
}
