# ACP Loop Extract and Per-Agent Session Disk Lookup Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development.

**Goal:** Extract the ACP stdio line classifier (today’s loop decision table) into `agent_host`, look up session dirs across all four CLI homes, and pin npm adapter argv.

**Constraints:** AgentId closed enum. Dirty isolation. TDD. Do not spawn CLIs in tests. Do not invent vendor JSONL schemas — missing `updates.jsonl` → empty updates.

---

### Task 1: ACP stdio line classifier (agent_host.rs, clean)

Add to `src-tauri/src/agent_host.rs`:

```
#[derive(Debug, PartialEq, Eq)]
pub(crate) enum AcpStdioLine {
    Skip,
    Request,
    Message,
    Log,
}

pub(crate) fn classify_acp_stdio_line(line: &str) -> AcpStdioLine {
    let trimmed = line.trim();
    if trimmed.is_empty() { return AcpStdioLine::Skip; }
    match serde_json::from_str::<Value>(trimmed) {
        Ok(v) if v.get("method").is_some() && v.get("id").is_some() => AcpStdioLine::Request,
        Ok(_) => AcpStdioLine::Message,
        Err(_) => AcpStdioLine::Log,
    }
}
```

Tests: empty/whitespace skip; `{"method":"x","id":1}` request; `{"jsonrpc":"2.0","result":{}}` message; `not json` log.

Commit only agent_host.rs:

```
feat: extract ACP stdio line classification from the host loop
```

---

### Task 2: Isolation — spawn_reader uses classifier

Dirty lib.rs dance. In spawn_reader, replace the nested if/json parse with `classify_acp_stdio_line`. Behavior must match (skip empty, request → handle_agent_request, else message emit, parse fail → acp-log).

```
feat: run the tagged ACP reader through the extracted classifier
```

---

### Task 3: Session disk roots (new session_lookup.rs)

```
pub(crate) fn session_roots(user_home: &Path, grok_home: &Path) -> Vec<(String, PathBuf)>
// grok → grok_home/sessions
// kimi → user_home/.kimi-code/sessions
// claude → user_home/.claude/projects
// codex → user_home/.codex/sessions

pub(crate) fn find_session_dir_in(session_id: &str, roots: &[(String, PathBuf)]) -> Option<(String, PathBuf)>
// WalkDir max_depth 3 each root; first dir whose file_name == session_id
```

Tests with temp dirs.

Isolation: `mod session_lookup;`

```
feat: look up session directories across four CLI homes
```

---

### Task 4: Isolation — find_session_dir / delete_session use all roots

`find_session_dir` becomes:

```
let home = dirs_home();
let roots = crate::session_lookup::session_roots(&home, &grok_home());
crate::session_lookup::find_session_dir_in(session_id, &roots).map(|(_, p)| p)
```

`delete_session`: find in all roots, `remove_dir_all` that path; not found → error.

`read_session_updates` already uses find_session_dir — other CLIs get updates.jsonl if present, else empty (already).

```
feat: resolve and delete sessions on any CLI home
```

---

### Task 5: Pin npm ACP adapter versions

Look up current versions of `@agentclientprotocol/claude-agent-acp` and `@agentclientprotocol/codex-acp` via `npm view ... version` (network). Pin in:
- `src/lib/agent-profile.ts` + test
- `src-tauri/src/agent_host.rs` default_spawn_profile
- `src-tauri/src/adapters.rs` spawn_argv test

Write `docs/superpowers/specs/acp-probe/README.md` stating: desktop spawn argv as of 2026-08-31; initialize dumps not captured (no live probe this round); pins are npm registry versions.

```
feat: pin Claude and Codex ACP adapter npm versions
```
