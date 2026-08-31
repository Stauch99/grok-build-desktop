use std::collections::BTreeSet;
use std::fs;
use std::io::{BufRead, BufReader};
use std::path::Path;

pub struct ScannedSession {
    pub agent_id: String,
    pub id: String,
    pub title: String,
    pub updated_at: String,
    pub dir: String,
    pub cwd: String,
    pub parent_session_id: Option<String>,
    pub session_kind: Option<String>,
}

pub enum ScanMode {
    ImmediateDirs, // kimi: wd_* wrappers containing session_* dirs
    ClaudeJsonl,   // ~/.claude/projects/<slug>/*.jsonl
    CodexRollouts, // ~/.codex/sessions/YYYY/MM/DD/rollout-*.jsonl
}

pub fn scan_agent_sessions(root: &Path, agent_id: &str, mode: ScanMode) -> Vec<ScannedSession> {
    match mode {
        ScanMode::ImmediateDirs => expand_nested_sessions(scan_named_subdirs(root, agent_id)),
        ScanMode::ClaudeJsonl => scan_claude_jsonl(root, agent_id),
        ScanMode::CodexRollouts => scan_codex_rollouts(root, agent_id),
    }
}

pub fn scan_vendor_homes(user_home: &Path) -> Vec<ScannedSession> {
    let mut out = Vec::new();
    out.extend(scan_agent_sessions(
        &user_home.join(".kimi-code").join("sessions"),
        "kimi",
        ScanMode::ImmediateDirs,
    ));
    out.extend(scan_agent_sessions(
        &user_home.join(".claude").join("projects"),
        "claude",
        ScanMode::ClaudeJsonl,
    ));
    out.extend(scan_agent_sessions(
        &user_home.join(".codex").join("sessions"),
        "codex",
        ScanMode::CodexRollouts,
    ));
    out
}

pub fn collect_cwds(rows: &[ScannedSession]) -> Vec<String> {
    let mut set = BTreeSet::new();
    for row in rows {
        let cwd = row.cwd.trim();
        if !cwd.is_empty() {
            set.insert(cwd.to_string());
        }
    }
    set.into_iter().collect()
}

pub fn keep_row_for_cwd(row_cwd: &str, want: &str) -> bool {
    want.is_empty() || row_cwd.is_empty() || row_cwd == want
}

pub fn scan_named_subdirs(root: &Path, agent_id: &str) -> Vec<ScannedSession> {
    if !root.is_dir() {
        return Vec::new();
    }
    let Ok(entries) = fs::read_dir(root) else {
        return Vec::new();
    };
    let mut rows = Vec::new();
    for entry in entries.flatten() {
        let path = entry.path();
        if !path.is_dir() {
            continue;
        }
        let name = entry.file_name();
        let name_str = name.to_string_lossy();
        if name_str.is_empty() || name_str.starts_with('.') {
            continue;
        }
        let updated_at = entry
            .metadata()
            .ok()
            .and_then(|m| m.modified().ok())
            .and_then(|t| t.duration_since(std::time::UNIX_EPOCH).ok())
            .map(|d| d.as_secs().to_string())
            .unwrap_or_default();
        rows.push(ScannedSession {
            agent_id: agent_id.to_string(),
            id: name_str.to_string(),
            title: name_str.to_string(),
            updated_at,
            dir: path.to_string_lossy().to_string(),
            cwd: String::new(),
            parent_session_id: None,
            session_kind: None,
        });
    }
    rows
}

fn expand_nested_sessions(wrappers: Vec<ScannedSession>) -> Vec<ScannedSession> {
    let mut out = Vec::new();
    for wrapper in wrappers {
        out.extend(scan_session_children(&wrapper));
    }
    out
}

fn scan_session_children(wrapper: &ScannedSession) -> Vec<ScannedSession> {
    let root = Path::new(&wrapper.dir);
    let Ok(entries) = fs::read_dir(root) else {
        return Vec::new();
    };
    let mut rows = Vec::new();
    for entry in entries.flatten() {
        let path = entry.path();
        if !path.is_dir() {
            continue;
        }
        let name = entry.file_name().to_string_lossy().into_owned();
        if !name.starts_with("session_") {
            continue;
        }
        let meta = read_kimi_state(&path.join("state.json"));
        let row = ScannedSession {
            agent_id: wrapper.agent_id.clone(),
            id: name,
            title: meta.title.unwrap_or_else(|| wrapper.title.clone()),
            updated_at: meta
                .updated_at
                .unwrap_or_else(|| wrapper.updated_at.clone()),
            dir: path.to_string_lossy().into_owned(),
            cwd: meta.cwd.unwrap_or_default(),
            parent_session_id: None,
            session_kind: None,
        };
        rows.extend(scan_kimi_agents(&row));
        rows.push(row);
    }
    rows
}

fn scan_kimi_agents(parent: &ScannedSession) -> Vec<ScannedSession> {
    let agents = Path::new(&parent.dir).join("agents");
    if !agents.is_dir() {
        return Vec::new();
    }
    let Ok(entries) = fs::read_dir(&agents) else {
        return Vec::new();
    };
    let mut rows = Vec::new();
    for entry in entries.flatten() {
        let path = entry.path();
        if !path.is_dir() {
            continue;
        }
        let name = entry.file_name().to_string_lossy().into_owned();
        if name == "main" || name.starts_with('.') {
            continue;
        }
        rows.push(ScannedSession {
            agent_id: parent.agent_id.clone(),
            id: name.clone(),
            title: name,
            updated_at: parent.updated_at.clone(),
            dir: path.to_string_lossy().into_owned(),
            cwd: parent.cwd.clone(),
            parent_session_id: Some(parent.id.clone()),
            session_kind: Some("subagent".into()),
        });
    }
    rows
}

struct KimiStateMeta {
    title: Option<String>,
    cwd: Option<String>,
    updated_at: Option<String>,
}

fn read_kimi_state(path: &Path) -> KimiStateMeta {
    let empty = KimiStateMeta {
        title: None,
        cwd: None,
        updated_at: None,
    };
    let Ok(text) = fs::read_to_string(path) else {
        return empty;
    };
    let Ok(value) = serde_json::from_str::<serde_json::Value>(&text) else {
        return empty;
    };
    let title = value
        .get("title")
        .and_then(|v| v.as_str())
        .map(str::trim)
        .filter(|s| !s.is_empty())
        .map(str::to_string);
    let cwd = json_nonempty_str(&value, &["workDir", "cwd"]);
    let updated_at = match value.get("updatedAt") {
        Some(serde_json::Value::String(s)) if !s.is_empty() => Some(s.clone()),
        Some(serde_json::Value::Number(n)) => Some(n.to_string()),
        _ => None,
    };
    KimiStateMeta {
        title,
        cwd,
        updated_at,
    }
}

fn json_nonempty_str(value: &serde_json::Value, keys: &[&str]) -> Option<String> {
    for key in keys {
        if let Some(s) = value
            .get(*key)
            .and_then(|v| v.as_str())
            .map(str::trim)
            .filter(|s| !s.is_empty())
        {
            return Some(s.to_string());
        }
    }
    None
}

fn file_mtime_secs(path: &Path) -> String {
    fs::metadata(path)
        .ok()
        .and_then(|m| m.modified().ok())
        .and_then(|t| t.duration_since(std::time::UNIX_EPOCH).ok())
        .map(|d| d.as_secs().to_string())
        .unwrap_or_default()
}

fn scan_claude_jsonl(root: &Path, agent_id: &str) -> Vec<ScannedSession> {
    if !root.is_dir() {
        return Vec::new();
    }
    let Ok(projects) = fs::read_dir(root) else {
        return Vec::new();
    };
    let mut rows = Vec::new();
    for project in projects.flatten() {
        let project_path = project.path();
        if !project_path.is_dir() {
            continue;
        }
        let name = project.file_name();
        let name_str = name.to_string_lossy();
        if name_str.is_empty() || name_str.starts_with('.') {
            continue;
        }
        let Ok(files) = fs::read_dir(&project_path) else {
            continue;
        };
        let mut project_rows = Vec::new();
        for file in files.flatten() {
            let file_path = file.path();
            if file_path.extension().and_then(|e| e.to_str()) != Some("jsonl") {
                continue;
            }
            if let Some(row) = parse_claude_jsonl(&file_path, agent_id) {
                project_rows.push(row);
            }
        }
        for parent in project_rows {
            rows.extend(scan_claude_subagents(&project_path, &parent));
            rows.push(parent);
        }
    }
    rows
}

fn scan_claude_subagents(project_path: &Path, parent: &ScannedSession) -> Vec<ScannedSession> {
    let sub_dir = project_path.join(&parent.id).join("subagents");
    if !sub_dir.is_dir() {
        return Vec::new();
    }
    let Ok(entries) = fs::read_dir(&sub_dir) else {
        return Vec::new();
    };
    let mut rows = Vec::new();
    for entry in entries.flatten() {
        let file_path = entry.path();
        if file_path.extension().and_then(|e| e.to_str()) != Some("jsonl") {
            continue;
        }
        let name = entry.file_name().to_string_lossy().into_owned();
        if name.contains("prompt_suggestion") {
            continue;
        }
        let Some(mut row) = parse_claude_jsonl(&file_path, &parent.agent_id) else {
            continue;
        };
        row.parent_session_id = Some(parent.id.clone());
        row.session_kind = Some("subagent".into());
        if row.cwd.is_empty() {
            row.cwd = parent.cwd.clone();
        }
        if let Some(stripped) = row.id.strip_prefix("agent-") {
            row.id = stripped.to_string();
        }
        rows.push(row);
    }
    rows
}

fn parse_claude_jsonl(path: &Path, agent_id: &str) -> Option<ScannedSession> {
    let file = fs::File::open(path).ok()?;
    let reader = BufReader::new(file);
    let stem = path.file_stem()?.to_string_lossy().into_owned();
    if stem.is_empty() {
        return None;
    }
    let mut cwd = String::new();
    let mut session_id = stem.clone();
    let mut title = String::new();
    for (i, line) in reader.lines().enumerate() {
        if i >= 80 {
            break;
        }
        let Ok(line) = line else {
            continue;
        };
        let Ok(value) = serde_json::from_str::<serde_json::Value>(&line) else {
            continue;
        };
        if cwd.is_empty() {
            if let Some(s) = json_nonempty_str(&value, &["cwd"]) {
                cwd = s;
            }
        }
        if let Some(s) = json_nonempty_str(&value, &["sessionId"]) {
            session_id = s;
        }
        if title.is_empty() {
            if let Some(s) = json_nonempty_str(&value, &["customTitle"]) {
                title = s;
            }
        }
    }
    Some(ScannedSession {
        agent_id: agent_id.to_string(),
        id: session_id.clone(),
        title: if title.is_empty() { session_id } else { title },
        updated_at: file_mtime_secs(path),
        dir: path.to_string_lossy().into_owned(),
        cwd,
        parent_session_id: None,
        session_kind: None,
    })
}

fn scan_codex_rollouts(root: &Path, agent_id: &str) -> Vec<ScannedSession> {
    if !root.is_dir() {
        return Vec::new();
    }
    let mut rows = Vec::new();
    for year in read_dir_dirs(root) {
        for month in read_dir_dirs(&year) {
            for day in read_dir_dirs(&month) {
                let Ok(files) = fs::read_dir(&day) else {
                    continue;
                };
                for file in files.flatten() {
                    let path = file.path();
                    let name = file.file_name();
                    let name_str = name.to_string_lossy();
                    if !name_str.ends_with(".jsonl") {
                        continue;
                    }
                    if let Some(row) = parse_codex_rollout(&path, agent_id) {
                        rows.push(row);
                    }
                }
            }
        }
    }
    rows
}

fn read_dir_dirs(root: &Path) -> Vec<std::path::PathBuf> {
    let Ok(entries) = fs::read_dir(root) else {
        return Vec::new();
    };
    entries
        .flatten()
        .map(|e| e.path())
        .filter(|p| p.is_dir())
        .collect()
}

fn parse_codex_rollout(path: &Path, agent_id: &str) -> Option<ScannedSession> {
    let file = fs::File::open(path).ok()?;
    let mut first = String::new();
    BufReader::new(file).read_line(&mut first).ok()?;
    let value: serde_json::Value = serde_json::from_str(first.trim()).ok()?;
    if value.get("type").and_then(|v| v.as_str()) != Some("session_meta") {
        return None;
    }
    let payload = value.get("payload").unwrap_or(&value);
    let id = json_nonempty_str(payload, &["session_id", "id"])?;
    let cwd = json_nonempty_str(payload, &["cwd"]).unwrap_or_default();
    let updated_at = json_nonempty_str(payload, &["timestamp"])
        .or_else(|| json_nonempty_str(&value, &["timestamp"]))
        .unwrap_or_else(|| file_mtime_secs(path));
    Some(ScannedSession {
        agent_id: agent_id.to_string(),
        id: id.clone(),
        title: id,
        updated_at,
        dir: path.to_string_lossy().into_owned(),
        cwd,
        parent_session_id: None,
        session_kind: None,
    })
}

#[cfg(test)]
mod tests {
    use super::*;
    use std::fs;
    use std::path::PathBuf;

    fn uniq() -> PathBuf {
        let n = std::time::SystemTime::now()
            .duration_since(std::time::UNIX_EPOCH)
            .unwrap()
            .as_nanos();
        std::env::temp_dir().join(format!("session_scan_test_{n}"))
    }

    #[test]
    fn lists_immediate_dirs_only() {
        let root = uniq();
        fs::create_dir_all(&root).unwrap();
        fs::create_dir_all(root.join("abc")).unwrap();
        fs::create_dir_all(root.join(".hidden")).unwrap();
        fs::write(root.join("file.txt"), "x").unwrap();
        let rows = scan_named_subdirs(&root, "kimi");
        assert_eq!(rows.len(), 1);
        assert_eq!(rows[0].agent_id, "kimi");
        assert_eq!(rows[0].id, "abc");
        fs::remove_dir_all(root).ok();
    }

    #[test]
    fn missing_root_yields_no_sessions() {
        let rows = scan_agent_sessions(PathBuf::from("/no/such/claude-projects").as_path(), "claude", ScanMode::ClaudeJsonl);
        assert!(rows.is_empty());
    }

    #[test]
    fn kimi_wrapper_without_sessions_is_not_a_chat() {
        let root = uniq();
        fs::create_dir_all(root.join("wd_abc")).unwrap();
        let rows = scan_agent_sessions(&root, "kimi", ScanMode::ImmediateDirs);
        assert!(rows.is_empty(), "wd_* folders are workspaces, not chats");
        fs::remove_dir_all(root).ok();
    }

    #[test]
    fn kimi_reads_cwd_when_work_dir_missing() {
        let root = uniq();
        let sid = "session_cwd_only";
        let inner = root.join("wd_hkust").join(sid);
        fs::create_dir_all(&inner).unwrap();
        fs::write(
            inner.join("state.json"),
            r#"{"title":"HKUST","cwd":"/Users/foxie/Documents/HKUST.GZ Project","updatedAt":1787019898459}"#,
        )
        .unwrap();
        let rows = scan_agent_sessions(&root, "kimi", ScanMode::ImmediateDirs);
        assert_eq!(rows.len(), 1);
        assert_eq!(rows[0].id, sid);
        assert_eq!(rows[0].cwd, "/Users/foxie/Documents/HKUST.GZ Project");
        fs::remove_dir_all(root).ok();
    }

    #[test]
    fn claude_jsonl_uses_record_cwd_not_project_slug() {
        let root = uniq();
        let proj = root.join("-Users-foxie-project-development-grok-build-desktop");
        fs::create_dir_all(proj.join("memory")).unwrap();
        let sid = "4fea9f3c-9d1f-449f-ae22-4930197422a6";
        fs::write(
            proj.join(format!("{sid}.jsonl")),
            concat!(
                r#"{"type":"queue-operation","sessionId":"4fea9f3c-9d1f-449f-ae22-4930197422a6"}"#,
                "\n",
                r#"{"type":"attachment","cwd":"/Users/foxie/project_development/grok_build_desktop","sessionId":"4fea9f3c-9d1f-449f-ae22-4930197422a6"}"#,
                "\n",
                r#"{"type":"custom-title","customTitle":"多CLI客户端","sessionId":"4fea9f3c-9d1f-449f-ae22-4930197422a6"}"#,
                "\n",
            ),
        )
        .unwrap();
        fs::write(
            proj.join("memory").join("notes.jsonl"),
            "{\"cwd\":\"/should-ignore\"}\n",
        )
        .unwrap();
        let rows = scan_agent_sessions(&root, "claude", ScanMode::ClaudeJsonl);
        assert_eq!(rows.len(), 1);
        assert_eq!(rows[0].id, sid);
        assert_eq!(rows[0].agent_id, "claude");
        assert_eq!(
            rows[0].cwd,
            "/Users/foxie/project_development/grok_build_desktop"
        );
        assert_eq!(rows[0].title, "多CLI客户端");
        fs::remove_dir_all(root).ok();
    }

    #[test]
    fn claude_project_slug_is_not_a_session() {
        let root = uniq();
        fs::create_dir_all(root.join("-Users-foxie")).unwrap();
        let rows = scan_agent_sessions(&root, "claude", ScanMode::ClaudeJsonl);
        assert!(rows.is_empty());
        fs::remove_dir_all(root).ok();
    }

    #[test]
    fn claude_subagent_jsonl_nests_under_parent_uuid() {
        let root = uniq();
        let proj = root.join("-Users-foxie-work");
        let parent = "aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa";
        let child = "bbbbbbbb-bbbb-bbbb-bbbb-bbbbbbbbbbbb";
        fs::create_dir_all(proj.join(parent).join("subagents")).unwrap();
        fs::write(
            proj.join(format!("{parent}.jsonl")),
            format!(
                "{}\n",
                r#"{"type":"user","cwd":"/Users/foxie/work","sessionId":"aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa","customTitle":"main"}"#
            ),
        )
        .unwrap();
        fs::write(
            proj.join(parent)
                .join("subagents")
                .join(format!("agent-{child}.jsonl")),
            format!(
                "{}\n",
                r#"{"type":"user","cwd":"/Users/foxie/work","sessionId":"bbbbbbbb-bbbb-bbbb-bbbb-bbbbbbbbbbbb","isSidechain":true,"customTitle":"中文技巧"}"#
            ),
        )
        .unwrap();
        fs::write(
            proj.join(parent)
                .join("subagents")
                .join("agent-aprompt_suggestion-zzzz.jsonl"),
            "{\"type\":\"user\"}\n",
        )
        .unwrap();
        let rows = scan_agent_sessions(&root, "claude", ScanMode::ClaudeJsonl);
        let kids: Vec<_> = rows
            .iter()
            .filter(|r| r.session_kind.as_deref() == Some("subagent"))
            .collect();
        assert_eq!(kids.len(), 1);
        assert_eq!(kids[0].id, child);
        assert_eq!(kids[0].parent_session_id.as_deref(), Some(parent));
        assert_eq!(kids[0].cwd, "/Users/foxie/work");
        assert_eq!(kids[0].title, "中文技巧");
        assert!(rows
            .iter()
            .any(|r| r.id == parent && r.parent_session_id.is_none()));
        fs::remove_dir_all(root).ok();
    }

    #[test]
    fn codex_rollout_reads_session_meta_cwd() {
        let root = uniq();
        let day = root.join("2026").join("08").join("01");
        fs::create_dir_all(&day).unwrap();
        let sid = "019fb92b-6c3b-7c12-8865-117c1ee2aefd";
        fs::write(
            day.join(format!("rollout-2026-08-01T01-14-18-{sid}.jsonl")),
            format!(
                r#"{{"timestamp":"2026-07-31T17:14:18.555Z","type":"session_meta","payload":{{"session_id":"{sid}","id":"{sid}","cwd":"/Users/foxie/Documents/ZAOYI","timestamp":"2026-07-31T17:14:18.555Z"}}}}"#
            ) + "\n",
        )
        .unwrap();
        let rows = scan_agent_sessions(&root, "codex", ScanMode::CodexRollouts);
        assert_eq!(rows.len(), 1);
        assert_eq!(rows[0].id, sid);
        assert_eq!(rows[0].agent_id, "codex");
        assert_eq!(rows[0].cwd, "/Users/foxie/Documents/ZAOYI");
        assert_ne!(rows[0].id, "2026");
        fs::remove_dir_all(root).ok();
    }

    #[test]
    fn collect_cwds_keeps_distinct_project_paths() {
        let rows = vec![
            ScannedSession {
                agent_id: "kimi".into(),
                id: "a".into(),
                title: "a".into(),
                updated_at: "1".into(),
                dir: "/tmp/a".into(),
                cwd: "/Users/foxie/Documents/GlobalEdu".into(),
                parent_session_id: None,
                session_kind: None,
            },
            ScannedSession {
                agent_id: "codex".into(),
                id: "b".into(),
                title: "b".into(),
                updated_at: "2".into(),
                dir: "/tmp/b".into(),
                cwd: "/Users/foxie/Documents/ZAOYI".into(),
                parent_session_id: None,
                session_kind: None,
            },
            ScannedSession {
                agent_id: "claude".into(),
                id: "c".into(),
                title: "c".into(),
                updated_at: "3".into(),
                dir: "/tmp/c".into(),
                cwd: String::new(),
                parent_session_id: None,
                session_kind: None,
            },
            ScannedSession {
                agent_id: "kimi".into(),
                id: "d".into(),
                title: "d".into(),
                updated_at: "4".into(),
                dir: "/tmp/d".into(),
                cwd: "/Users/foxie/Documents/GlobalEdu".into(),
                parent_session_id: None,
                session_kind: None,
            },
        ];
        let cwds = collect_cwds(&rows);
        assert_eq!(
            cwds,
            vec![
                "/Users/foxie/Documents/GlobalEdu".to_string(),
                "/Users/foxie/Documents/ZAOYI".to_string(),
            ]
        );
    }

    #[test]
    fn keep_row_for_cwd_keeps_empty_row_and_empty_want() {
        assert!(keep_row_for_cwd("", "/some/project"));
        assert!(!keep_row_for_cwd("/other", "/some/project"));
        assert!(keep_row_for_cwd("/other", ""));
        assert!(keep_row_for_cwd("", ""));
        assert!(keep_row_for_cwd("/some/project", "/some/project"));
    }

    #[test]
    fn parent_fields_default_none_on_named_dirs() {
        let root = uniq();
        fs::create_dir_all(root.join("abc")).unwrap();
        let rows = scan_named_subdirs(&root, "kimi");
        assert_eq!(rows.len(), 1);
        assert_eq!(rows[0].parent_session_id, None);
        assert_eq!(rows[0].session_kind, None);
        fs::remove_dir_all(root).ok();
    }

    #[test]
    fn scanned_session_can_carry_subagent_parent() {
        let row = ScannedSession {
            agent_id: "claude".into(),
            id: "agent-1".into(),
            title: "agent-1".into(),
            updated_at: "1".into(),
            dir: "/tmp/a".into(),
            cwd: "/work".into(),
            parent_session_id: Some("parent-uuid".into()),
            session_kind: Some("subagent".into()),
        };
        assert_eq!(row.parent_session_id.as_deref(), Some("parent-uuid"));
        assert_eq!(row.session_kind.as_deref(), Some("subagent"));
    }

    #[test]
    fn kimi_agents_dir_nests_subagents_under_session() {
        let root = uniq();
        let sid = "session_parent";
        let inner = root.join("wd_x").join(sid);
        fs::create_dir_all(inner.join("agents").join("main")).unwrap();
        fs::create_dir_all(inner.join("agents").join("researcher")).unwrap();
        fs::write(inner.join("state.json"), r#"{"title":"调研","cwd":"/work/proj","updatedAt":"9"}"#).unwrap();
        fs::write(inner.join("agents").join("main").join("wire.jsonl"), "{}\n").unwrap();
        fs::write(inner.join("agents").join("researcher").join("wire.jsonl"), "{}\n").unwrap();
        let rows = scan_agent_sessions(&root, "kimi", ScanMode::ImmediateDirs);
        let parent = rows.iter().find(|r| r.id == sid).unwrap();
        assert_eq!(parent.parent_session_id, None);
        let kids: Vec<_> = rows.iter().filter(|r| r.parent_session_id.as_deref() == Some(sid)).collect();
        assert_eq!(kids.len(), 1);
        assert_eq!(kids[0].id, "researcher");
        assert_eq!(kids[0].session_kind.as_deref(), Some("subagent"));
        assert_eq!(kids[0].cwd, "/work/proj");
        assert!(!rows.iter().any(|r| r.id == "main"));
        fs::remove_dir_all(root).ok();
    }

    #[test]
    fn kimi_nested_session_reads_state_json() {
        let root = uniq();
        let sid = "session_b42204e6-b461-4912-bb2b-57805a5e5edb";
        let inner = root.join("wd_kimi-smoke").join(sid);
        fs::create_dir_all(&inner).unwrap();
        fs::write(
            inner.join("state.json"),
            r#"{"title":"Kimi smoke","workDir":"/tmp/kimi-smoke","updatedAt":"1710000000"}"#,
        )
        .unwrap();
        let rows = scan_agent_sessions(&root, "kimi", ScanMode::ImmediateDirs);
        assert_eq!(rows.len(), 1);
        assert_eq!(rows[0].id, sid);
        assert_eq!(rows[0].agent_id, "kimi");
        assert_eq!(rows[0].title, "Kimi smoke");
        assert_eq!(rows[0].cwd, "/tmp/kimi-smoke");
        fs::remove_dir_all(root).ok();
    }

    #[test]
    fn scan_vendor_homes_binds_each_cli_to_its_project_cwd() {
        let home = uniq();
        let kimi = home
            .join(".kimi-code")
            .join("sessions")
            .join("wd_globaledu")
            .join("session_k1");
        fs::create_dir_all(&kimi).unwrap();
        fs::write(
            kimi.join("state.json"),
            r#"{"title":"Kimi","workDir":"/Users/foxie/Documents/GlobalEdu"}"#,
        )
        .unwrap();
        let claude = home.join(".claude").join("projects").join("-Users-foxie");
        fs::create_dir_all(&claude).unwrap();
        fs::write(
            claude.join("sess-claude.jsonl"),
            r#"{"type":"user","cwd":"/Users/foxie/project_development/grok_build_desktop","sessionId":"sess-claude"}"#,
        )
        .unwrap();
        let codex = home
            .join(".codex")
            .join("sessions")
            .join("2026")
            .join("08")
            .join("01");
        fs::create_dir_all(&codex).unwrap();
        fs::write(
            codex.join("rollout-x.jsonl"),
            r#"{"type":"session_meta","payload":{"session_id":"codex-1","cwd":"/Users/foxie/Documents/ZAOYI"}}"#,
        )
        .unwrap();
        let rows = scan_vendor_homes(&home);
        let by_id: std::collections::HashMap<_, _> =
            rows.into_iter().map(|r| (r.id.clone(), r)).collect();
        assert_eq!(by_id["session_k1"].cwd, "/Users/foxie/Documents/GlobalEdu");
        assert_eq!(
            by_id["sess-claude"].cwd,
            "/Users/foxie/project_development/grok_build_desktop"
        );
        assert_eq!(by_id["codex-1"].cwd, "/Users/foxie/Documents/ZAOYI");
        assert!(!by_id.contains_key("2026"));
        assert!(!by_id.contains_key("-Users-foxie"));
        fs::remove_dir_all(home).ok();
    }
}
