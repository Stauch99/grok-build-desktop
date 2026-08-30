use std::path::{Path, PathBuf};

use walkdir::WalkDir;

pub(crate) fn session_roots(user_home: &Path, grok_home: &Path) -> Vec<(String, PathBuf)> {
    vec![
        ("grok".into(), grok_home.join("sessions")),
        ("kimi".into(), user_home.join(".kimi-code").join("sessions")),
        ("claude".into(), user_home.join(".claude").join("projects")),
        ("codex".into(), user_home.join(".codex").join("sessions")),
    ]
}

pub(crate) fn find_session_dir_in(
    session_id: &str,
    roots: &[(String, PathBuf)],
) -> Option<(String, PathBuf)> {
    for (agent, root) in roots {
        if !root.is_dir() {
            continue;
        }
        for entry in WalkDir::new(root).max_depth(3).into_iter().flatten() {
            if entry.file_type().is_dir() && entry.file_name() == session_id {
                return Some((agent.clone(), entry.path().to_path_buf()));
            }
        }
    }
    None
}

#[cfg(test)]
mod tests {
    use super::*;
    use std::fs;

    fn uniq(prefix: &str) -> PathBuf {
        let n = std::time::SystemTime::now()
            .duration_since(std::time::UNIX_EPOCH)
            .unwrap()
            .as_nanos();
        std::env::temp_dir().join(format!("{prefix}_{n}"))
    }

    #[test]
    fn session_roots_maps_four_cli_homes() {
        let user = Path::new("/Users/me");
        let grok = Path::new("/Users/me/.grok");
        let roots = session_roots(user, grok);
        assert_eq!(roots.len(), 4);
        assert_eq!(roots[0], ("grok".into(), grok.join("sessions")));
        assert_eq!(
            roots[1],
            ("kimi".into(), user.join(".kimi-code").join("sessions"))
        );
        assert_eq!(
            roots[2],
            ("claude".into(), user.join(".claude").join("projects"))
        );
        assert_eq!(
            roots[3],
            ("codex".into(), user.join(".codex").join("sessions"))
        );
    }

    #[test]
    fn find_session_dir_in_locates_shallow_session() {
        let base = uniq("session_lookup_shallow");
        let grok_home = base.join(".grok");
        let session_id = "abc123";
        let session_dir = grok_home.join("sessions").join(session_id);
        fs::create_dir_all(&session_dir).unwrap();
        let roots = session_roots(&base, &grok_home);
        let found = find_session_dir_in(session_id, &roots).unwrap();
        assert_eq!(found.0, "grok");
        assert_eq!(found.1, session_dir);
        fs::remove_dir_all(base).ok();
    }

    #[test]
    fn find_session_dir_in_searches_up_to_depth_three() {
        let base = uniq("session_lookup_deep");
        let grok_home = base.join(".grok");
        let session_id = "nested-session";
        let session_dir = grok_home
            .join("sessions")
            .join("group")
            .join("sub")
            .join(session_id);
        fs::create_dir_all(&session_dir).unwrap();
        let roots = session_roots(&base, &grok_home);
        let found = find_session_dir_in(session_id, &roots).unwrap();
        assert_eq!(found.0, "grok");
        assert_eq!(found.1, session_dir);
        fs::remove_dir_all(base).ok();
    }

    #[test]
    fn find_session_dir_in_prefers_first_root_match() {
        let base = uniq("session_lookup_order");
        let grok_home = base.join(".grok");
        let session_id = "dup-id";
        let grok_dir = grok_home.join("sessions").join(session_id);
        let kimi_dir = base
            .join(".kimi-code")
            .join("sessions")
            .join(session_id);
        fs::create_dir_all(&grok_dir).unwrap();
        fs::create_dir_all(&kimi_dir).unwrap();
        let roots = session_roots(&base, &grok_home);
        let found = find_session_dir_in(session_id, &roots).unwrap();
        assert_eq!(found.0, "grok");
        assert_eq!(found.1, grok_dir);
        fs::remove_dir_all(base).ok();
    }

    #[test]
    fn find_session_dir_in_skips_missing_roots() {
        let base = uniq("session_lookup_missing");
        let grok_home = base.join(".grok");
        let session_id = "kimi-only";
        let kimi_dir = base
            .join(".kimi-code")
            .join("sessions")
            .join(session_id);
        fs::create_dir_all(&kimi_dir).unwrap();
        let roots = session_roots(&base, &grok_home);
        let found = find_session_dir_in(session_id, &roots).unwrap();
        assert_eq!(found.0, "kimi");
        assert_eq!(found.1, kimi_dir);
        fs::remove_dir_all(base).ok();
    }

    #[test]
    fn find_session_dir_in_returns_none_when_absent() {
        let base = uniq("session_lookup_absent");
        let grok_home = base.join(".grok");
        fs::create_dir_all(grok_home.join("sessions")).unwrap();
        let roots = session_roots(&base, &grok_home);
        assert!(find_session_dir_in("no-such-session", &roots).is_none());
        fs::remove_dir_all(base).ok();
    }
}
