use std::path::{Path, PathBuf};

const DENIED_SPAWN_BASENAMES: &[&str] = &[
    "sh",
    "bash",
    "zsh",
    "dash",
    "fish",
    "csh",
    "ksh",
    "cmd",
    "powershell",
    "pwsh",
    "osascript",
    "wscript",
    "cscript",
];

pub(crate) fn doctor_homes(user_home: &Path, grok_home: &Path) -> [(&'static str, PathBuf); 4] {
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

pub(crate) fn toml_spawn_rejected(
    id: crate::agent_host::AgentId,
    grok_bin: Option<&Path>,
    grok_bin_dir: &Path,
    registry_toml: Option<&str>,
) -> Option<String> {
    let text = registry_toml?;
    let (cmd, _) = crate::agent_registry::spawn_args_from_toml(text, id)?;
    let cmd = cmd.trim();
    if cmd.is_empty() {
        return None;
    }
    if spawn_cmd_is_allowed(cmd, grok_bin, grok_bin_dir, crate::agent_host::which_on_path) {
        return None;
    }
    Some(cmd.to_string())
}

fn spawn_basename(cmd: &str) -> String {
    Path::new(cmd.trim())
        .file_name()
        .and_then(|n| n.to_str())
        .unwrap_or(cmd.trim())
        .trim_end_matches(".exe")
        .to_ascii_lowercase()
}

pub(crate) fn spawn_cmd_is_allowed(
    cmd: &str,
    grok_bin: Option<&Path>,
    grok_bin_dir: &Path,
    lookup: impl Fn(&str) -> Option<PathBuf>,
) -> bool {
    let cmd = cmd.trim();
    if cmd.is_empty() {
        return true;
    }
    let base = spawn_basename(cmd);
    if DENIED_SPAWN_BASENAMES.contains(&base.as_str()) {
        return false;
    }
    if matches!(base.as_str(), "grok" | "kimi" | "npx") && !Path::new(cmd).is_absolute() {
        return true;
    }
    let path = Path::new(cmd);
    if !path.is_absolute() {
        return false;
    }
    if grok_bin == Some(path) {
        return true;
    }
    if path.starts_with(grok_bin_dir) {
        return true;
    }
    if let Some(found) = lookup(&base) {
        if found == path {
            return true;
        }
    }
    false
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
    let grok_bin_dir = crate::grok_home().join("bin");
    if !spawn_cmd_is_allowed(cmd, grok_bin, &grok_bin_dir, crate::agent_host::which_on_path) {
        return None;
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
        let (cmd, args) =
            crate::agent_host::spawn_npx_adapter(crate::agent_host::CLAUDE_ACP_PKG, empty, |_| {
                None
            });
        assert_eq!(cmd, PathBuf::from("npx"));
        assert_eq!(
            args,
            vec![
                "-y".to_string(),
                crate::agent_host::CLAUDE_ACP_PKG.to_string()
            ]
        );
        let (cmd, args) =
            crate::agent_host::spawn_npx_adapter(crate::agent_host::CODEX_ACP_PKG, empty, |_| None);
        assert_eq!(cmd, PathBuf::from("npx"));
        assert_eq!(
            args,
            vec![
                "-y".to_string(),
                crate::agent_host::CODEX_ACP_PKG.to_string()
            ]
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
            args.iter()
                .any(|a| a.contains(crate::agent_host::CLAUDE_ACP_PKG)
                    || a.contains("claude-agent-acp")),
            "claude spawn should pin the ACP package, got {cmd:?} {args:?}"
        );
    }

    #[test]
    fn spawn_allowlist_rejects_shells_and_unknown_binaries() {
        let grok_bin = PathBuf::from("/Users/me/.grok/bin/grok");
        let bin_dir = Path::new("/Users/me/.grok/bin");
        let lookup = |name: &str| match name {
            "kimi" => Some(PathBuf::from("/usr/bin/kimi")),
            _ => None,
        };
        assert!(spawn_cmd_is_allowed("kimi", Some(&grok_bin), bin_dir, lookup));
        assert!(spawn_cmd_is_allowed("npx", Some(&grok_bin), bin_dir, lookup));
        assert!(spawn_cmd_is_allowed("/Users/me/.grok/bin/grok", Some(&grok_bin), bin_dir, lookup));
        assert!(spawn_cmd_is_allowed("/usr/bin/kimi", None, bin_dir, lookup));
        assert!(!spawn_cmd_is_allowed("sh", Some(&grok_bin), bin_dir, lookup));
        assert!(!spawn_cmd_is_allowed("osascript", None, bin_dir, lookup));
        assert!(!spawn_cmd_is_allowed("/tmp/evil", Some(&grok_bin), bin_dir, lookup));
        assert!(!spawn_cmd_is_allowed("python3", None, bin_dir, lookup));
        let sh_toml = r#"[agents.kimi]
enabled = true
command = "sh"
args = ["-c", "id"]
"#;
        assert_eq!(
            toml_spawn_rejected(AgentId::Kimi, None, bin_dir, Some(sh_toml)).as_deref(),
            Some("sh")
        );
        let (cmd, args) = spawn_argv(AgentId::Kimi, None, Some(sh_toml)).unwrap();
        assert_eq!(cmd, PathBuf::from("kimi"));
        assert_eq!(args, vec!["acp".to_string()]);
    }
}
