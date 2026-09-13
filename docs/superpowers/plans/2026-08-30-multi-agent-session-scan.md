# Multi-Agent Session Directory Scan Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development.

**Goal:** `list_sessions` returns Grok rows plus directory-discovered Kimi/Claude/Codex sessions. Do not invent vendor JSON fields — id = folder name, title = folder name, timestamps from mtime.

**Constraints:** AgentId closed enum. Never delete. Dirty isolation. TDD. Tests use temp dirs only.

---

### Task 1: scan_named_subdirs

**Files:** Create `src-tauri/src/session_scan.rs` + `mod session_scan;` isolation.

```
pub struct ScannedSession {
    pub agent_id: String,
    pub id: String,
    pub title: String,
    pub updated_at: String, // RFC3339 or unix millis string — use SystemTime → ISO if easy, else unix secs as decimal string
    pub dir: String,
}

pub fn scan_named_subdirs(root: &Path, agent_id: &str) -> Vec<ScannedSession>
```

- If root is not a dir, return []
- Each **immediate subdirectory** whose name is non-empty and not `.` / `..` becomes a row
- Skip names starting with `.`
- `dir` = full path of that subdirectory

```rust
#[test]
fn lists_immediate_dirs_only() {
    let root = uniq();
    fs::create_dir_all(root.join("abc")).unwrap();
    fs::create_dir_all(root.join(".hidden")).unwrap();
    fs::write(root.join("file.txt"), "x").unwrap();
    let rows = scan_named_subdirs(&root, "kimi");
    assert_eq!(rows.len(), 1);
    assert_eq!(rows[0].agent_id, "kimi");
    assert_eq!(rows[0].id, "abc");
    fs::remove_dir_all(root).ok();
}
```

```
feat: scan CLI session directories without parsing vendor JSON
```

---

### Task 2: Isolation list_sessions union

On clean HEAD lib.rs after dance:

After `cached_sessions()`, also:

```
let home = dirs_home();
let extra = [
    crate::session_scan::scan_named_subdirs(&home.join(".kimi-code").join("sessions"), "kimi"),
    crate::session_scan::scan_named_subdirs(&home.join(".claude").join("projects"), "claude"),
    crate::session_scan::scan_named_subdirs(&home.join(".codex").join("sessions"), "codex"),
];
for batch in extra {
    for row in batch {
        out.push(SessionSummary {
            id: row.id,
            agent_id: row.agent_id,
            cwd: String::new(),
            title: row.title,
            model: None,
            agent_name: None,
            updated_at: row.updated_at,
            created_at: String::new(),
            num_messages: 0,
            dir: Some(row.dir),
            session_kind: None,
            parent_session_id: None,
            last_turn_summary: None,
            last_turn_summary_prompt_id: None,
        });
    }
}
out.sort_by(|a, b| b.updated_at.cmp(&a.updated_at));
```

Check SessionSummary fields on HEAD after checkout — include every required field.

Also filter scanned rows through `adapters::sessions_for`? Not needed if we never pass grok dirs into other agents.

```
feat: union Kimi Claude Codex session dirs into list_sessions
```
