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

/// Grok replay reads only `updates.jsonl`. Vendor session dirs may hold
/// `chat.jsonl` or other artifacts; those must not enable replay.
pub(crate) fn replay_path_or_empty(dir: &Path) -> bool {
    crate::session_replay::resolve_transcript(dir).is_some()
}

pub(crate) fn find_session_dir_in(
    session_id: &str,
    roots: &[(String, PathBuf)],
) -> Option<(String, PathBuf)> {
    for (agent, root) in roots {
        if !root.is_dir() {
            continue;
        }
        let mut dir_hit: Option<PathBuf> = None;
        for entry in WalkDir::new(root).max_depth(4).into_iter().flatten() {
            let name = entry.file_name();
            if entry.file_type().is_dir() && name == session_id {
                if dir_hit.is_none() {
                    dir_hit = Some(entry.path().to_path_buf());
                }
                continue;
            }
            if entry.file_type().is_file() {
                let name_str = name.to_string_lossy();
                if name_str == format!("{session_id}.jsonl")
                    || (name_str.ends_with(".jsonl") && name_str.contains(session_id))
                {
                    return Some((agent.clone(), entry.path().to_path_buf()));
                }
            }
        }
        if let Some(dir) = dir_hit {
            return Some((agent.clone(), dir));
        }
    }
    None
}

fn path_under_roots(path: &Path, roots: &[(String, PathBuf)]) -> bool {
    if path
        .components()
        .any(|c| matches!(c, std::path::Component::ParentDir))
    {
        return false;
    }
    roots.iter().any(|(_, root)| path.starts_with(root))
}

/// Prefer the scanned `dir` when it sits under a known session root; else find by id.
pub(crate) fn resolve_delete_path(
    session_id: &str,
    dir: Option<&str>,
    roots: &[(String, PathBuf)],
) -> Option<PathBuf> {
    if let Some(raw) = dir.map(str::trim).filter(|s| !s.is_empty()) {
        let path = PathBuf::from(raw);
        if path_under_roots(&path, roots) && (path.is_file() || path.is_dir()) {
            return Some(path);
        }
    }
    find_session_dir_in(session_id, roots).map(|(_, path)| path)
}

/// Delete a session path returned by `find_session_dir_in`.
/// Claude/Codex often resolve to a `.jsonl` file; Grok/Kimi resolve to a directory.
pub(crate) fn remove_session_at(path: &Path) -> std::io::Result<()> {
    if path.is_file() {
        let meta = path.with_extension("meta.json");
        std::fs::remove_file(path)?;
        if meta.is_file() {
            let _ = std::fs::remove_file(&meta);
        }
        if let Some(stem) = path.file_stem() {
            let sibling = path.with_file_name(stem);
            if sibling.is_dir() {
                std::fs::remove_dir_all(&sibling)?;
            }
        }
        return Ok(());
    }
    if path.is_dir() {
        return std::fs::remove_dir_all(path);
    }
    Err(std::io::Error::new(
        std::io::ErrorKind::NotFound,
        "session not found",
    ))
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
        let kimi_dir = base.join(".kimi-code").join("sessions").join(session_id);
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
        let kimi_dir = base.join(".kimi-code").join("sessions").join(session_id);
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

    #[test]
    fn find_session_dir_in_prefers_claude_jsonl_over_same_named_dir() {
        let base = uniq("session_lookup_claude_dir_and_jsonl");
        let grok_home = base.join(".grok");
        fs::create_dir_all(grok_home.join("sessions")).unwrap();
        let sid = "e79917b8-b11c-4133-b97d-ffcbfb01c669";
        let proj = base
            .join(".claude")
            .join("projects")
            .join("-Users-foxie-writing-projects");
        fs::create_dir_all(proj.join(sid).join("subagents")).unwrap();
        let file = proj.join(format!("{sid}.jsonl"));
        fs::write(
            &file,
            "{\"type\":\"user\",\"message\":{\"content\":\"继续\"}}\n",
        )
        .unwrap();
        let roots = session_roots(&base, &grok_home);
        let found = find_session_dir_in(sid, &roots).unwrap();
        assert_eq!(found.0, "claude");
        assert_eq!(
            found.1, file,
            "sibling UUID.jsonl must win over the UUID/ subagents dir"
        );
        fs::remove_dir_all(base).ok();
    }

    #[test]
    fn find_session_dir_in_locates_claude_jsonl_file() {
        let base = uniq("session_lookup_claude_jsonl");
        let grok_home = base.join(".grok");
        fs::create_dir_all(grok_home.join("sessions")).unwrap();
        let sid = "4fea9f3c-9d1f-449f-ae22-4930197422a6";
        let proj = base
            .join(".claude")
            .join("projects")
            .join("-Users-foxie-proj");
        fs::create_dir_all(&proj).unwrap();
        let file = proj.join(format!("{sid}.jsonl"));
        fs::write(&file, "{\"type\":\"user\"}\n").unwrap();
        let roots = session_roots(&base, &grok_home);
        let found = find_session_dir_in(sid, &roots).unwrap();
        assert_eq!(found.0, "claude");
        assert_eq!(found.1, file);
        fs::remove_dir_all(base).ok();
    }

    #[test]
    fn find_session_dir_in_locates_codex_rollout_at_depth_four() {
        let base = uniq("session_lookup_codex_rollout");
        let grok_home = base.join(".grok");
        fs::create_dir_all(grok_home.join("sessions")).unwrap();
        let sid = "019fb92b-6c3b-7c12-8865-117c1ee2aefd";
        let day = base
            .join(".codex")
            .join("sessions")
            .join("2026")
            .join("08")
            .join("01");
        fs::create_dir_all(&day).unwrap();
        let file = day.join(format!("rollout-2026-08-01T01-14-18-{sid}.jsonl"));
        fs::write(&file, "{\"type\":\"session_meta\"}\n").unwrap();
        let roots = session_roots(&base, &grok_home);
        let found = find_session_dir_in(sid, &roots).unwrap();
        assert_eq!(found.0, "codex");
        assert_eq!(found.1, file);
        fs::remove_dir_all(base).ok();
    }

    fn grok_update_line(kind: &str, text: &str) -> String {
        format!(
            r#"{{"params":{{"update":{{"sessionUpdate":"{kind}","content":{{"text":"{text}"}}}}}}}}"#
        )
    }

    #[test]
    fn kimi_like_dir_with_chat_jsonl_returns_empty_replay() {
        let dir = uniq("replay_empty_kimi");
        fs::create_dir_all(&dir).unwrap();
        fs::write(
            dir.join("chat.jsonl"),
            r#"{"type":"message","role":"user","content":"hello from kimi"}"#,
        )
        .unwrap();
        assert!(!replay_path_or_empty(&dir));
        let page = crate::session_updates_for_dir(&dir, None).unwrap();
        assert!(
            page.rows.is_empty(),
            "vendor chat.jsonl must not produce replay rows"
        );
        assert_eq!(page.next_byte, 0);
        assert!(!page.truncated);
        fs::remove_dir_all(dir).ok();
    }

    #[test]
    fn grok_dir_with_updates_jsonl_returns_replay_rows() {
        let dir = uniq("replay_grok_rows");
        fs::create_dir_all(&dir).unwrap();
        let line = grok_update_line("user_message_chunk", "hi");
        fs::write(dir.join("updates.jsonl"), format!("{line}\n")).unwrap();
        assert!(replay_path_or_empty(&dir));
        let page = crate::session_updates_for_dir(&dir, None).unwrap();
        assert_eq!(
            page.rows.len(),
            1,
            "Grok updates.jsonl must yield replay rows"
        );
        assert!(page.next_byte > 0);
        fs::remove_dir_all(dir).ok();
    }

    #[test]
    fn remove_session_at_deletes_claude_jsonl_and_sibling_dir() {
        let root = uniq("remove_claude_jsonl");
        let sid = "e79917b8-b11c-4133-b97d-ffcbfb01c669";
        let proj = root.join("projects").join("-work");
        fs::create_dir_all(proj.join(sid).join("subagents")).unwrap();
        let file = proj.join(format!("{sid}.jsonl"));
        fs::write(&file, "{\"type\":\"user\"}\n").unwrap();
        fs::write(
            proj.join(sid)
                .join("subagents")
                .join("agent-ab4a5fb3123330325.jsonl"),
            "{}\n",
        )
        .unwrap();
        fs::write(
            proj.join(sid)
                .join("subagents")
                .join("agent-ab4a5fb3123330325.meta.json"),
            r#"{"description":"调研"}"#,
        )
        .unwrap();
        remove_session_at(&file).unwrap();
        assert!(!file.exists(), "parent jsonl must be unlinked");
        assert!(
            !proj.join(sid).exists(),
            "sibling UUID/ subagents dir must go with the jsonl"
        );
        fs::remove_dir_all(root).ok();
    }

    #[test]
    fn remove_session_at_deletes_jsonl_file_without_a_dir() {
        let root = uniq("remove_jsonl_only");
        fs::create_dir_all(&root).unwrap();
        let file = root.join("sess.jsonl");
        fs::write(&file, "{}\n").unwrap();
        remove_session_at(&file).unwrap();
        assert!(!file.exists());
        fs::remove_dir_all(root).ok();
    }

    #[test]
    fn remove_session_at_deletes_a_session_directory() {
        let dir = uniq("remove_grok_dir");
        fs::create_dir_all(&dir).unwrap();
        fs::write(dir.join("summary.json"), "{}").unwrap();
        remove_session_at(&dir).unwrap();
        assert!(!dir.exists());
    }

    #[test]
    fn resolve_delete_path_prefers_a_dir_under_session_roots() {
        let base = uniq("resolve_delete_prefers_dir");
        let grok = base.join(".grok");
        let sessions = grok.join("sessions").join("proj").join("abc");
        fs::create_dir_all(&sessions).unwrap();
        let roots = session_roots(&base, &grok);
        let found = resolve_delete_path("abc", Some(&sessions.to_string_lossy()), &roots).unwrap();
        assert_eq!(found, sessions);
        fs::remove_dir_all(base).ok();
    }

    #[test]
    fn resolve_delete_path_rejects_a_dir_outside_session_roots() {
        let base = uniq("resolve_delete_rejects");
        let grok = base.join(".grok");
        fs::create_dir_all(grok.join("sessions")).unwrap();
        let outside = base.join("not-a-session");
        fs::create_dir_all(&outside).unwrap();
        let roots = session_roots(&base, &grok);
        assert!(resolve_delete_path("abc", Some(&outside.to_string_lossy()), &roots).is_none());
        fs::remove_dir_all(base).ok();
    }

    #[test]
    fn resolve_delete_path_falls_back_to_find_by_id() {
        let base = uniq("resolve_delete_fallback");
        let grok = base.join(".grok");
        let session_dir = grok.join("sessions").join("proj").join("abc");
        fs::create_dir_all(&session_dir).unwrap();
        let roots = session_roots(&base, &grok);
        let found = resolve_delete_path("abc", None, &roots).unwrap();
        assert_eq!(found, session_dir);
        fs::remove_dir_all(base).ok();
    }
}
