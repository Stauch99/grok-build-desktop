# Multi-Agent Persist, Doctor-All, and Adapter Skeleton Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Persist desktop UI state at `~/.acp-workbench/workbench.json` (migrate from `~/.grok/webui.json`), stamp `SessionSummary.agentId`, expose `doctor_all` from file/env evidence, and land an AdminPort skeleton so Grok is one of four backends.

**Architecture:** Spec `docs/superpowers/specs/2026-08-30-multi-agent-acp-workbench-design.md`. Path helpers already exist in `agents_paths.rs` and `workbench-home.ts`. This wave adds load/migrate and adapter DTOs. Phase 0 live ACP probes stay follow-on; other CLIs return empty session lists until scanners exist.

**Tech Stack:** TypeScript + Vitest; Rust unit tests. No new dependencies.

## Global Constraints

- AgentId closed enum. API key wins. Bare session keys migrate to `grok/<id>`.
- Do not spawn CLIs in this plan. Do not write the real user home in tests.
- First-open migrate copies webui → workbench once; never delete `~/.grok/webui.json`.
- Dirty isolation. `git add` only owned files. Never `git add -A`. TDD.
- GrokAdapter list_sessions is today’s grok scan + `agentId: "grok"`. Other adapters: empty sessions, doctor from evidence only.

## Follow-on

- Composer `selectedAgentId` chip (dirty App.tsx)
- Hub MarketTab → `install_marketplace_skill`
- Native Kimi/Claude/Codex session directory scanners
- Phase 0 ACP probes + pin npm versions

---

### Task 1: Rust workbench load/migrate (new module)

**Files:**
- Create: `src-tauri/src/workbench_state.rs`
- Modify: `src-tauri/src/lib.rs` — isolation: add `mod workbench_state;` after `mod marketplace;`

**Interfaces:**
- `pub(crate) fn migrate_session_key(key: &str) -> Option<String>`
  - empty → None
  - no `/` → `Some(format!("grok/{key}"))`
  - `agent/rest` where agent is grok|kimi|claude|codex and rest non-empty → `Some(key.to_string())`
  - else None
- `pub(crate) fn migrate_session_map(value: &serde_json::Value) -> serde_json::Value`
  - if value is object, rewrite keys; drop keys that migrate to None; last-write-wins on collision
  - else return value clone
- `pub(crate) fn migrate_workbench_doc(mut doc: serde_json::Value) -> serde_json::Value`
  - if object, for each of `pinned`, `titles`, `drafts`, `archived`, `unread` that is an **object**, replace with `migrate_session_map`
  - if `pinned` / `archived` are **arrays of strings**, map each string through `migrate_session_key` and drop None
  - set `lastAgent` to `"grok"` if missing
- `pub(crate) fn should_copy_webui(workbench_exists: bool, grok_webui_exists: bool) -> bool` — delegate to `agents_paths::should_migrate_webui`

- [ ] **Step 1: failing tests** in `workbench_state.rs`:

```rust
#[cfg(test)]
mod tests {
    use super::*;
    use serde_json::json;

    #[test]
    fn migrates_bare_keys_and_keeps_branded() {
        assert_eq!(migrate_session_key("abc").as_deref(), Some("grok/abc"));
        assert_eq!(migrate_session_key("claude/x").as_deref(), Some("claude/x"));
        assert_eq!(migrate_session_key(""), None);
        assert_eq!(migrate_session_key("nope/x"), None);
        let doc = migrate_workbench_doc(json!({
            "pinned": { "s1": true },
            "titles": { "s1": "Hi" },
            "theme": "dark"
        }));
        assert_eq!(doc["pinned"]["grok/s1"], true);
        assert_eq!(doc["titles"]["grok/s1"], "Hi");
        assert_eq!(doc["theme"], "dark");
        assert_eq!(doc["lastAgent"], "grok");
        let arr = migrate_workbench_doc(json!({ "pinned": ["s1", "claude/x"] }));
        assert_eq!(arr["pinned"], json!(["grok/s1", "claude/x"]));
    }
}
```

- [ ] **Step 2:** isolation dance for `mod workbench_state;` (same as marketplace: stash dirty lib.rs, checkout HEAD, add one line, test, commit both files, restore dirty, re-apply `mod`).
- [ ] **Step 3–5:** implement, GREEN `cargo test --manifest-path src-tauri/Cargo.toml workbench_state`, commit only `workbench_state.rs` + the one-line `lib.rs` mod.

```
feat: migrate webui session maps into workbench.json shape
```

---

### Task 2: Stamp session agentId (pure Rust helper)

**Files:**
- Create: `src-tauri/src/session_brand.rs` (or add to `agent_host.rs` if you prefer zero extra mod — **prefer new file** `session_brand.rs`)
- Isolation: `mod session_brand;` after `mod workbench_state;`

**Interfaces:**
- `pub(crate) fn stamp_agent_id(raw: Option<&str>) -> agent_host::AgentId` — parse grok|kimi|claude|codex else Grok

Need `AgentId` from `agent_host`. If `AgentId` is not Copy, return owned.

- [ ] **Step 1:**

```rust
#[test]
fn stamps_missing_as_grok() {
    assert_eq!(stamp_agent_id(None), crate::agent_host::AgentId::Grok);
    assert_eq!(stamp_agent_id(Some("claude")), crate::agent_host::AgentId::Claude);
    assert_eq!(stamp_agent_id(Some("nope")), crate::agent_host::AgentId::Grok);
}
```

Check `AgentId` variants in `agent_host.rs` before writing — use the actual variant names.

- [ ] **Step 2–5:** isolation + commit

```
feat: default session agentId to grok
```

---

### Task 3: doctor_all evidence (pure Rust)

**Files:**
- Create: `src-tauri/src/agent_doctor.rs`
- Isolation: `mod agent_doctor;`

**Interfaces:**
- `#[derive(Debug, Clone, PartialEq, Eq)] pub enum AuthKind { Subscription, Api, None }`
- `pub(crate) fn classify_auth(has_subscription: bool, has_api_key: bool) -> AuthKind` — key wins
- `#[derive(Debug, Clone, serde::Serialize)] #[serde(rename_all = "camelCase")] pub struct AgentDoctorDto { pub agent_id: String, pub binary: Option<String>, pub version: Option<String>, pub home: String, pub auth_present: bool, pub auth_kind: String, pub acp_spawn_ok: bool, pub login_hint: Vec<String> }`
- `pub(crate) fn doctor_from_evidence(agent_id: &str, home: String, has_subscription: bool, has_api_key: bool, binary: Option<String>, acp_spawn_ok: bool) -> AgentDoctorDto`
  - `auth_kind` string: `"subscription" | "api" | "none"`
  - `auth_present = has_subscription || has_api_key`
  - `login_hint = vec!["login".into()]`
  - `version = None`

- [ ] **Step 1:**

```rust
#[test]
fn api_key_wins() {
    let d = doctor_from_evidence("claude", "/Users/me/.claude".into(), true, true, Some("/bin/npx".into()), true);
    assert_eq!(d.auth_kind, "api");
    assert!(d.auth_present);
    assert_eq!(d.home, "/Users/me/.claude");
    let n = doctor_from_evidence("grok", "/Users/me/.grok".into(), false, false, None, false);
    assert_eq!(n.auth_kind, "none");
    assert!(!n.auth_present);
}
```

- [ ] **Step 2–5:** isolation + commit

```
feat: classify AgentDoctor authKind from evidence flags
```

---

### Task 4: TS AdminPort DTO + session union

**Files:**
- Create: `src/lib/admin-port.ts`
- Create: `src/lib/admin-port.test.ts`

**Interfaces:**
- `export type AdminSession = { agentId: AgentId; id: string; cwd: string; title: string; updatedAt: string; createdAt: string; numMessages: number }`
- `export function unionSessions(groups: AdminSession[][]): AdminSession[]` — concat, sort by `updatedAt` desc
- `export function emptySessions(_id: AgentId): AdminSession[]` — `[]`
- `export function grokSessionsFromRows(rows: Array<{ id: string; cwd: string; title: string; updatedAt: string; createdAt: string; numMessages: number }>): AdminSession[]` — stamp `agentId: "grok"`

- [ ] **Step 1:**

```ts
import { describe, expect, it } from "vitest";
import { emptySessions, grokSessionsFromRows, unionSessions } from "./admin-port";

describe("admin session union", () => {
  it("stamps grok and sorts by updatedAt desc", () => {
    const grok = grokSessionsFromRows([
      { id: "a", cwd: "/a", title: "A", updatedAt: "2026-01-01", createdAt: "2026-01-01", numMessages: 1 },
    ]);
    expect(grok[0]?.agentId).toBe("grok");
    expect(emptySessions("claude")).toEqual([]);
    const claude = [{ agentId: "claude" as const, id: "c", cwd: "/c", title: "C", updatedAt: "2026-02-01", createdAt: "2026-02-01", numMessages: 2 }];
    expect(unionSessions([grok, claude]).map((s) => s.id)).toEqual(["c", "a"]);
  });
});
```

- [ ] **Step 2–5:** implement, commit two new files only.

```
feat: union AdminPort sessions with grok stamp
```

---

### Task 5: Isolation wire persist + stamp + doctor_all + install command

**Files:**
- Modify: `src-tauri/src/lib.rs` (isolation dance)
- Modify: `src-tauri/src/marketplace.rs` — add `install_marketplace_skill` command fn (no lib.rs except handler register)
- Create if needed: tests stay in existing modules

**What to change in HEAD lib.rs (after checkout, before restore):**

1. `SessionSummary` add `agent_id: String` with `#[serde(default = "default_grok_agent")]` and `fn default_grok_agent() -> String { "grok".into() }`. When building session rows in existing constructors, set `agent_id: "grok".into()` if a struct literal requires it. If compile errors from missing fields, add `..` only if the struct uses Default — otherwise set the field at each literal. Prefer a small helper `fn with_grok(mut s: SessionSummary) -> SessionSummary { s.agent_id = "grok".into(); s }`.

2. `webui_path()` →
```rust
fn workbench_home() -> PathBuf {
    crate::agents_paths::workbench_home_from(
        &dirs_home(),
        std::env::var("ACP_WORKBENCH_HOME").ok().as_deref(),
    )
}
fn webui_path() -> PathBuf {
    crate::agents_paths::workbench_json_path(&workbench_home())
}
```

3. `load_webui_state`:
   - let `wb = webui_path()`
   - let `legacy = crate::agents_paths::grok_webui_path(&grok_home())`
   - if `should_migrate_webui(wb.is_file(), legacy.is_file())` { read legacy, `migrate_workbench_doc`, write wb, return migrated }
   - else existing load of `wb` (not legacy)

4. `save_webui_state` already uses `webui_path()` so it will write workbench.json once (2) lands.

5. Add command:
```rust
#[tauri::command]
async fn doctor_all() -> Vec<crate::agent_doctor::AgentDoctorDto> {
    // four empty-evidence doctors with default homes; do not spawn
    let home = dirs_home();
    let home_s = home.display().to_string();
    vec![
        crate::agent_doctor::doctor_from_evidence("grok", format!("{home_s}/.grok"), false, false, None, false),
        crate::agent_doctor::doctor_from_evidence("kimi", format!("{home_s}/.kimi-code"), false, false, None, false),
        crate::agent_doctor::doctor_from_evidence("claude", format!("{home_s}/.claude"), false, false, None, false),
        crate::agent_doctor::doctor_from_evidence("codex", format!("{home_s}/.codex"), false, false, None, false),
    ]
}
```
Wait — use actual defaultAgentHome paths. If `dirs_home` already is the user home, yes `~/.grok` etc.

Better: fill evidence without spawning:
- grok: `grok_home().join("auth.json").is_file()`; api key from env `XAI_API_KEY` or `GROK_API_KEY`
- kimi: `home.join(".kimi-code").join("auth.json").is_file()` OR any file you can check without inventing — if unknown, subscription=false; api `KIMI_API_KEY`
- claude: `home.join(".claude.json").is_file()` as oauth proxy; api `ANTHROPIC_API_KEY`
- codex: `home.join(".codex").join("auth.json").is_file()`; api `OPENAI_API_KEY` or `CODEX_API_KEY`

Do not invent extra files. These probes are conventional, not Phase 0 dumps.

6. Register `doctor_all` in invoke_handler next to `doctor`.

7. `install_marketplace_skill(source: String)` in marketplace.rs:
```rust
pub fn install_marketplace_skill_inner(source: &Path, agents_home: &Path) -> Result<String, String> {
    let name = skill_folder_name(source).ok_or_else(|| "invalid".to_string())?;
    let dest = agents_home.join("skills").join(&name);
    install_skill_folder(source, &dest)?;
    Ok(dest.display().to_string())
}
```
Tauri command wrapper + register.

8. After session scan, map rows through stamp: `row.agent_id = "grok".into()` if empty.

**Isolation dance:** stash dirty lib.rs, checkout HEAD, apply ONLY these workbench/doctor/session/marketplace handler edits, `cargo test workbench_state session_brand agent_doctor marketplace`, commit `lib.rs` + `marketplace.rs` if marketplace gained the inner fn, restore dirty lib.rs, re-apply the same hunks onto dirty (mod lines, webui_path, SessionSummary field, handler entries).

If a SessionSummary struct literal in dirty lib.rs lacks `agent_id`, add `agent_id: "grok".into()` when restoring.

```
feat: persist workbench.json and expose doctor_all
```

**Do not** modify `src/api.ts` in this task if it is dirty — follow-on TS invoke wrappers.

---
