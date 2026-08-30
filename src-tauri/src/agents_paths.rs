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
}
