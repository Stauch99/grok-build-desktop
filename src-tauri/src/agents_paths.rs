use std::path::{Path, PathBuf};

pub(crate) fn agents_home_from(home: &Path, override_env: Option<&str>) -> PathBuf {
    match override_env {
        Some(p) if !p.is_empty() => PathBuf::from(p),
        _ => home.join(".agents"),
    }
}

pub(crate) fn skill_md_path(agents_home: &Path, name: &str) -> PathBuf {
    agents_home.join("skills").join(name).join("SKILL.md")
}

pub(crate) fn workbench_home_from(home: &Path, override_env: Option<&str>) -> PathBuf {
    match override_env {
        Some(p) if !p.is_empty() => PathBuf::from(p),
        _ => home.join(".acp-workbench"),
    }
}

pub(crate) fn workbench_json_path(wb: &Path) -> PathBuf {
    wb.join("workbench.json")
}

pub(crate) fn grok_webui_path(grok_home: &Path) -> PathBuf {
    grok_home.join("webui.json")
}

pub(crate) fn should_migrate_webui(workbench_exists: bool, grok_webui_exists: bool) -> bool {
    !workbench_exists && grok_webui_exists
}

#[cfg(test)]
mod tests {
    use super::*;
    use std::path::Path;

    #[test]
    fn user_skill_path() {
        let home = agents_home_from(Path::new("/Users/me"), None);
        assert_eq!(home, PathBuf::from("/Users/me/.agents"));
        assert_eq!(
            skill_md_path(&home, "pdf"),
            PathBuf::from("/Users/me/.agents/skills/pdf/SKILL.md")
        );
    }

    #[test]
    fn override_env_wins() {
        let home = agents_home_from(Path::new("/Users/me"), Some("/tmp/agents"));
        assert_eq!(home, PathBuf::from("/tmp/agents"));
    }

    #[test]
    fn workbench_paths_and_migrate_gate() {
        let home = Path::new("/Users/me");
        assert_eq!(
            workbench_home_from(home, None),
            PathBuf::from("/Users/me/.acp-workbench")
        );
        assert_eq!(
            workbench_home_from(home, Some("/tmp/wb")),
            PathBuf::from("/tmp/wb")
        );
        assert_eq!(
            workbench_json_path(&PathBuf::from("/Users/me/.acp-workbench")),
            PathBuf::from("/Users/me/.acp-workbench/workbench.json")
        );
        assert_eq!(
            grok_webui_path(Path::new("/Users/me/.grok")),
            PathBuf::from("/Users/me/.grok/webui.json")
        );
        assert!(should_migrate_webui(false, true));
        assert!(!should_migrate_webui(true, true));
        assert!(!should_migrate_webui(false, false));
    }
}
