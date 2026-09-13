# Multi-brand CLI catalog and spawn Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Nested subagents in the left session list (disk parents + live Task/Agent tools) and a builtin `AgentManifest` that owns catalog kind, tool aliases, and initialize timeout for Grok/Kimi/Claude/Codex.

**Architecture:** Disk scanners fill `parentSessionId` / `sessionKind`. Live ACP tool rows become ephemeral `live:{agentId}:{toolCallId}` children while running. `nestByParent` is unchanged. Spawn stays `agents.toml` + `spawn_npx_adapter`. Manifests do not replace toml.

**Tech Stack:** Tauri 2 / Rust, React 19, Vitest, `cargo test --manifest-path src-tauri/Cargo.toml --lib`.

**Spec:** `docs/superpowers/specs/2026-08-31-multi-brand-cli-catalog-design.md`

## Global Constraints

- `AgentId` stays a closed enum: `grok | kimi | claude | codex` (TS and Rust lists identical).
- Do not vendor acp-ui, kimi-web, parse-cc, or clog. Copy layout rules only.
- Do not add `acpSpawnOk` to `AgentDoctorDto`.
- Do not change npm pins (`CLAUDE_ACP_PKG`, `CODEX_ACP_PKG`) or switch Codex packages.
- Do not rewrite `acp_loop`, hub Skills/MCP, imagine/video, or plugins.
- Live row ids always start with `live:`. Never `session/load` a live id.
- Live rows exist only while the tool is `pending` or `in_progress`.
- Child rows inherit parent `cwd`. Empty cwd must not send them to inbox by accident.
- Tests use temp dirs only. No network. No live CLI handshake in CI.
- Branch: `feat/multi-agent-workbench`. Isolation dance if `App.tsx` / `useAppModel.ts` / `lib.rs` are dirty: stash, edit, commit only this task’s hunks.
- Commit messages: `feat:` / `fix:` / `test:` / `docs:` English, imperative.

---

## File map

| File | Responsibility |
|---|---|
| `src-tauri/src/session_scan.rs` | `parent_session_id`, `session_kind`; Claude `subagents/`; Kimi `agents/` |
| `src-tauri/src/lib.rs` | Copy those fields in `list_sessions` (stop writing `None`) |
| `src-tauri/src/agent_manifest.rs` | Builtin catalog kind, aliases, timeout |
| `src-tauri/src/agent_host.rs` | `npx_adapter_resolves` |
| `src/lib/subagent.ts` | Alias matcher + display name |
| `src/lib/subagent-tree.ts` | Catalog names via display helper |
| `src/lib/live-roster.ts` | Synthetic rows, merge, live click target, parents to expand |
| `src/lib/session-chrome.ts` | `isEmptyDraft` keeps `sessionKind === "subagent"` |
| `src/lib/session-acp-list.ts` | Map + preserve `parentSessionId` |
| `src/lib/agent-warmup.ts` | `initializeTimeoutMs(agentId?)` |
| `src/hooks/useAppModel.ts` | Merge live roster; auto-expand; redirect live clicks |
| `src/hooks/useAcpSession.ts` | Timeout by agent; refuse live resume |
| `docs/HANDOFF.md` | Catalog + live + manifest checklist |

---

### Task 1: Preserve parent fields from disk scan

**Files:**
- Modify: `src-tauri/src/session_scan.rs`
- Modify: `src-tauri/src/lib.rs` (`list_sessions` vendor loop)
- Test: `src-tauri/src/session_scan.rs` (existing `#[cfg(test)]`)

**Interfaces:**
- Consumes: existing `ScannedSession` constructors
- Produces: `ScannedSession { parent_session_id: Option<String>, session_kind: Option<String>, ... }`; `list_sessions` copies both

- [ ] **Step 1: Write the failing test**

Add to `session_scan.rs` tests (use the existing `uniq()` helper). First add the fields to the struct so the crate compiles, then the new assertion:

```rust
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
```

Update every existing `ScannedSession {` literal in this file with `parent_session_id: None, session_kind: None`.

- [ ] **Step 2: Run test to verify it fails**

Run: `cargo test --manifest-path src-tauri/Cargo.toml --lib parent_fields_default_none -- --nocapture`

Expected: FAIL compiling `missing field parent_session_id` (or the new test not found) until the struct is extended.

- [ ] **Step 3: Write minimal implementation**

In `ScannedSession`:

```rust
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
```

Every constructor in `scan_named_subdirs`, `scan_session_children`, `parse_claude_jsonl`, `parse_codex_rollout` sets both Options to `None`.

In `lib.rs` `list_sessions` vendor loop, replace:

```rust
session_kind: None,
parent_session_id: None,
```

with:

```rust
session_kind: row.session_kind,
parent_session_id: row.parent_session_id,
```

- [ ] **Step 4: Run tests**

Run: `cargo test --manifest-path src-tauri/Cargo.toml --lib -- session_scan`

Expected: PASS (existing session_scan tests plus the two new ones).

- [ ] **Step 5: Commit**

```bash
git add src-tauri/src/session_scan.rs src-tauri/src/lib.rs
git commit -m "$(cat <<'EOF'
feat: copy vendor session parent and kind into the sidebar list

EOF
)"
```

---

### Task 2: Scan Claude `subagents/agent-*.jsonl`

**Files:**
- Modify: `src-tauri/src/session_scan.rs` (`scan_claude_jsonl` / new helper)
- Test: same file

**Interfaces:**
- Consumes: `parse_claude_jsonl`, Task 1 fields
- Produces: child rows with `parent_session_id = parent file stem`, `session_kind = "subagent"`, `cwd` copied from parent

- [ ] **Step 1: Write the failing test**

```rust
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
        proj.join(parent).join("subagents").join(format!("agent-{child}.jsonl")),
        format!(
            "{}\n",
            r#"{"type":"user","cwd":"/Users/foxie/work","sessionId":"bbbbbbbb-bbbb-bbbb-bbbb-bbbbbbbbbbbb","isSidechain":true,"customTitle":"中文技巧"}"#
        ),
    )
    .unwrap();
    fs::write(
        proj.join(parent).join("subagents").join("agent-aprompt_suggestion-zzzz.jsonl"),
        "{\"type\":\"user\"}\n",
    )
    .unwrap();
    let rows = scan_agent_sessions(&root, "claude", ScanMode::ClaudeJsonl);
    let kids: Vec<_> = rows.iter().filter(|r| r.session_kind.as_deref() == Some("subagent")).collect();
    assert_eq!(kids.len(), 1);
    assert_eq!(kids[0].id, child);
    assert_eq!(kids[0].parent_session_id.as_deref(), Some(parent));
    assert_eq!(kids[0].cwd, "/Users/foxie/work");
    assert_eq!(kids[0].title, "中文技巧");
    assert!(rows.iter().any(|r| r.id == parent && r.parent_session_id.is_none()));
    fs::remove_dir_all(root).ok();
}
```

- [ ] **Step 2: Run test to verify it fails**

Run: `cargo test --manifest-path src-tauri/Cargo.toml --lib claude_subagent_jsonl_nests -- --nocapture`

Expected: FAIL (`kids.len()` is 0).

- [ ] **Step 3: Write minimal implementation**

After listing top-level jsonl in `scan_claude_jsonl`, for each parent row whose `id` is `P`:

- `sub_dir = project_path.join(P).join("subagents")`
- Read dir; skip non-jsonl
- Skip names containing `prompt_suggestion`
- Parse with `parse_claude_jsonl`; then set:

```rust
row.parent_session_id = Some(parent_id.clone());
row.session_kind = Some("subagent".into());
if row.cwd.is_empty() {
    row.cwd = parent_cwd.clone();
}
if let Some(stripped) = row.id.strip_prefix("agent-") {
    row.id = stripped.to_string();
}
```

Id from filename: `agent-{uuid}.jsonl` → uuid (file stem minus `agent-` prefix). Prefer `sessionId` from jsonl when present.

Do not recurse into `memory/`.

- [ ] **Step 4: Run tests**

Run: `cargo test --manifest-path src-tauri/Cargo.toml --lib -- session_scan`

Expected: PASS, including `claude_jsonl_uses_record_cwd_not_project_slug` and `claude_project_slug_is_not_a_session`.

- [ ] **Step 5: Commit**

```bash
git add src-tauri/src/session_scan.rs
git commit -m "$(cat <<'EOF'
feat: nest Claude Task sidechains under the parent session file

EOF
)"
```

---

### Task 3: Scan Kimi `agents/<id>` children

**Files:**
- Modify: `src-tauri/src/session_scan.rs` (`scan_session_children`)
- Test: same file

**Interfaces:**
- Consumes: Task 1 fields; existing `session_*` rows
- Produces: extra rows per `agents/*` except `main`

- [ ] **Step 1: Write the failing test**

```rust
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
```

- [ ] **Step 2: Run test to verify it fails**

Run: `cargo test --manifest-path src-tauri/Cargo.toml --lib kimi_agents_dir_nests -- --nocapture`

Expected: FAIL (`kids.len()` is 0).

- [ ] **Step 3: Write minimal implementation**

After pushing a `session_*` row in `scan_session_children`, also call `scan_kimi_agents(&row)`:

- `agents = Path::new(&row.dir).join("agents")`
- Each subdirectory except `main` and names starting with `.`:

```rust
ScannedSession {
    agent_id: parent.agent_id.clone(),
    id: name,
    title: name.clone(), // or parent.title if you prefer; test expects id researcher
    updated_at: parent.updated_at.clone(),
    dir: path.to_string_lossy().into_owned(),
    cwd: parent.cwd.clone(),
    parent_session_id: Some(parent.id.clone()),
    session_kind: Some("subagent".into()),
}
```

Do not parse `wire.jsonl`. Existing `kimi_wrapper_without_sessions_is_not_a_chat` must stay green.

- [ ] **Step 4: Run tests**

Run: `cargo test --manifest-path src-tauri/Cargo.toml --lib -- session_scan`

Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add src-tauri/src/session_scan.rs
git commit -m "$(cat <<'EOF'
feat: nest Kimi agents directories under the parent session

EOF
)"
```

---

### Task 4: Multi-brand subagent tool matcher

**Files:**
- Modify: `src/lib/subagent.ts`
- Modify: `src/lib/subagent-tree.ts`
- Test: `src/lib/subagent.test.ts`
- Test: `src/lib/jobs-header.test.ts` (Task tools must leave the jobs header)

**Interfaces:**
- Consumes: existing `subagentStatusFromTool`
- Produces: `subagentStatusFromTool(title, status, agentId?: AgentId)` still works with 2 args; `subagentDisplayName(title): string`

- [ ] **Step 1: Write the failing tests**

Append to `src/lib/subagent.test.ts`:

```ts
import type { AgentId } from "./agent-id";
import { subagentDisplayName, subagentStatusFromTool } from "./subagent";

it("maps Claude Task and Agent titles", () => {
  expect(subagentStatusFromTool("Task: 中文技巧", "in_progress")).toBe("running");
  expect(subagentStatusFromTool("Agent", "pending")).toBe("running");
  expect(subagentStatusFromTool("task", "completed")).toBe("completed");
});

it("maps Kimi swarm titles", () => {
  expect(subagentStatusFromTool("swarm", "in_progress", "kimi")).toBe("running");
});

it("still ignores bash and a bare subagent token", () => {
  expect(subagentStatusFromTool("bash", "in_progress")).toBeNull();
  expect(subagentStatusFromTool("subagent", "running")).toBeNull();
});

it("strips alias prefixes for display names", () => {
  expect(subagentDisplayName("Task: 中文技巧")).toBe("中文技巧");
  expect(subagentDisplayName("spawn_subagent researcher")).toBe("researcher");
  expect(subagentDisplayName("Agent")).toBe("Agent");
});
```

In `jobs-header.test.ts` add:

```ts
it("excludes Claude Task tools from the jobs header", () => {
  const items: ChatItem[] = [
    { kind: "tool", id: "t1", title: "bash ls", status: "in_progress" },
    { kind: "tool", id: "t2", title: "Task: 中文技巧", status: "in_progress" },
  ];
  expect(headerJobs(items)).toEqual([{ id: "t1", title: "bash ls", status: "in_progress" }]);
});
```

In `subagentCatalog` test, names for `spawn_subagent researcher` stay `researcher` via `subagentDisplayName`.

- [ ] **Step 2: Run tests to verify they fail**

Run: `npx vitest run src/lib/subagent.test.ts src/lib/jobs-header.test.ts`

Expected: FAIL on Task/Agent/swarm mapping.

- [ ] **Step 3: Write minimal implementation**

`src/lib/subagent.ts`:

```ts
import type { AgentId } from "./agent-id";

const DEFAULT_ALIASES = ["spawn_subagent", "get_command_or_subagent_output", "task", "agent"] as const;

const EXTRA: Record<AgentId, readonly string[]> = {
  grok: [],
  kimi: ["swarm"],
  claude: [],
  codex: [],
};

function firstToken(normalized: string): string {
  return normalized.split("_")[0] ?? normalized;
}

function aliasesFor(agentId?: AgentId): string[] {
  const extra = agentId ? EXTRA[agentId] : Object.values(EXTRA).flat();
  return [...new Set([...DEFAULT_ALIASES, ...extra])];
}
```

When `agentId` is omitted, union **all** extras with defaults so existing 2-arg call sites (jobs header, catalog, App cards) match Claude Task without plumbing agent yet. Per-agent narrowing is used when the third arg is passed.

Match if `normalized === alias`, `normalized.startsWith(alias + "_")`, or `firstToken(normalized) === alias` for alias in the list. Do **not** match alias `subagent`. Keep `mapStatus` as today.

`subagentDisplayName`: strip the longest matching alias prefix plus optional separators; if the remainder is empty, return the original title.

`subagent-tree.ts` name field: `subagentDisplayName(it.title)`.

- [ ] **Step 4: Run tests**

Run: `npx vitest run src/lib/subagent.test.ts src/lib/jobs-header.test.ts`

Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add src/lib/subagent.ts src/lib/subagent-tree.ts src/lib/subagent.test.ts src/lib/jobs-header.test.ts
git commit -m "$(cat <<'EOF'
feat: treat Task Agent and swarm tools as subagents

EOF
)"
```

---

### Task 5: Live roster rows and empty-draft exception

**Files:**
- Create: `src/lib/live-roster.ts`
- Create: `src/lib/live-roster.test.ts`
- Modify: `src/lib/session-chrome.ts`
- Modify: `src/lib/session-chrome.test.ts`

**Interfaces:**
- Consumes: `ChatItem`, `subagentStatusFromTool`, `subagentDisplayName`, `SessionSummary`, `AgentId`
- Produces:

```ts
export function liveRosterId(agentId: AgentId, toolCallId: string): string
export function isLiveRosterId(id: string): boolean
export function liveRosterFromTools(
  items: ChatItem[],
  opts: { agentId: AgentId; parentSessionId: string; cwd: string; nowIso: string },
): SessionSummary[]
export function mergeLiveRoster(base: SessionSummary[], live: SessionSummary[]): SessionSummary[]
export function sessionToOpen(clicked: SessionSummary, all: SessionSummary[]): SessionSummary
export function parentsToExpandForLive(sessions: SessionSummary[]): string[]
```

- [ ] **Step 1: Write the failing tests**

`src/lib/live-roster.test.ts`:

```ts
import { describe, expect, it } from "vitest";
import type { ChatItem } from "./chat";
import type { SessionSummary } from "../api";
import {
  isLiveRosterId,
  liveRosterFromTools,
  liveRosterId,
  mergeLiveRoster,
  parentsToExpandForLive,
  sessionToOpen,
} from "./live-roster";

function tool(partial: Pick<ChatItem & { kind: "tool" }, "id" | "title" | "status">): ChatItem {
  return { kind: "tool", ...partial };
}

function row(partial: Partial<SessionSummary> & Pick<SessionSummary, "id">): SessionSummary {
  return {
    cwd: "/work",
    title: partial.id,
    updatedAt: "2026-08-31T00:00:00.000Z",
    createdAt: "2026-08-31T00:00:00.000Z",
    numMessages: 1,
    ...partial,
  };
}

describe("liveRosterFromTools", () => {
  it("emits live children only for running Task tools", () => {
    const items: ChatItem[] = [
      tool({ id: "c1", title: "Task: 中文技巧", status: "in_progress" }),
      tool({ id: "c2", title: "Task: 英文技巧", status: "completed" }),
      tool({ id: "b", title: "bash", status: "in_progress" }),
    ];
    const live = liveRosterFromTools(items, {
      agentId: "claude",
      parentSessionId: "parent",
      cwd: "/work",
      nowIso: "2026-08-31T11:00:00.000Z",
    });
    expect(live).toHaveLength(1);
    expect(live[0]).toMatchObject({
      id: liveRosterId("claude", "c1"),
      parentSessionId: "parent",
      agentId: "claude",
      sessionKind: "subagent",
      title: "中文技巧",
      cwd: "/work",
      numMessages: 1,
    });
    expect(isLiveRosterId(live[0].id)).toBe(true);
  });
});

describe("mergeLiveRoster", () => {
  it("appends live rows and skips duplicate ids", () => {
    const id = liveRosterId("claude", "c1");
    const disk = [row({ id: "parent", title: "main" }), row({ id, title: "already" })];
    const live = [row({ id, title: "live", parentSessionId: "parent", sessionKind: "subagent" })];
    const out = mergeLiveRoster(disk, live);
    expect(out.filter((s) => s.id === id)).toHaveLength(1);
    expect(out.some((s) => s.id === "parent")).toBe(true);
  });
});

describe("sessionToOpen", () => {
  it("opens the parent when the clicked row is live", () => {
    const parent = row({ id: "parent", title: "main" });
    const live = row({
      id: liveRosterId("claude", "c1"),
      parentSessionId: "parent",
      sessionKind: "subagent",
    });
    expect(sessionToOpen(live, [parent, live]).id).toBe("parent");
    expect(sessionToOpen(parent, [parent, live]).id).toBe("parent");
  });
});

describe("parentsToExpandForLive", () => {
  it("returns parents of live children", () => {
    expect(
      parentsToExpandForLive([
        row({ id: "parent" }),
        row({ id: liveRosterId("claude", "c1"), parentSessionId: "parent", sessionKind: "subagent" }),
      ]),
    ).toEqual(["parent"]);
  });
});
```

In `session-chrome.test.ts` (import `isEmptyDraft`):

```ts
it("keeps live subagent rows with zero-looking drafts out of the trash filter", () => {
  expect(
    isEmptyDraft(
      s({
        id: "live:claude:c1",
        numMessages: 1,
        sessionKind: "subagent",
        parentSessionId: "p",
        agentId: "claude",
      }),
    ),
  ).toBe(false);
  expect(
    isEmptyDraft(
      s({
        id: "live:claude:c1",
        numMessages: 0,
        dir: undefined,
        sessionKind: "subagent",
        agentId: "claude",
      }),
    ),
  ).toBe(false);
});
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `npx vitest run src/lib/live-roster.test.ts src/lib/session-chrome.test.ts`

Expected: FAIL module not found / `isEmptyDraft` true for subagent with 0 messages.

- [ ] **Step 3: Write minimal implementation**

`liveRosterId`: `return \`live:${agentId}:${toolCallId}\``

`isLiveRosterId`: `id.startsWith("live:")`

`liveRosterFromTools`: for each `kind === "tool"`, `subagentStatusFromTool(title, status, opts.agentId) === "running"` → one `SessionSummary`.

`mergeLiveRoster`: copy `base`; for each live row, skip if `base` already has that `id`.

`sessionToOpen`: if `isLiveRosterId(clicked.id)` and `clicked.parentSessionId`, return the matching parent or `clicked` if missing.

`parentsToExpandForLive`: unique `parentSessionId` of rows where `isLiveRosterId(id)`.

`isEmptyDraft`: if `s.sessionKind === "subagent"` return false; then existing logic.

- [ ] **Step 4: Run tests**

Run: `npx vitest run src/lib/live-roster.test.ts src/lib/session-chrome.test.ts`

Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add src/lib/live-roster.ts src/lib/live-roster.test.ts src/lib/session-chrome.ts src/lib/session-chrome.test.ts
git commit -m "$(cat <<'EOF'
feat: build ephemeral sidebar rows for running subagent tools

EOF
)"
```

---

### Task 6: Wire live roster into the sidebar

**Files:**
- Modify: `src/hooks/useAppModel.ts`
- Modify: `src/hooks/useAcpSession.ts` (`resumeSession` guard)
- Test: `src/lib/live-roster.test.ts` already covers helpers; add `src/lib/session-agent.test.ts` only if you put the live redirect next to `planOpenSession`. Prefer calling `sessionToOpen` from `openSession` / `resumeSession`.

**Interfaces:**
- Consumes: Task 5 functions, `chat.items`, `sessionId`, `selectedAgentId`, `cwd`
- Produces: `allSessions` includes live children of the focused session; live click opens parent; `collapsedIds` drops those parents

- [ ] **Step 1: Write the failing test**

Do not mount the whole hook. Extend `live-roster.test.ts` is already done. Add a pure helper in `src/lib/live-roster.ts` if missing:

```ts
export function sessionsWithLiveRoster(
  base: SessionSummary[],
  items: ChatItem[],
  opts: { agentId: AgentId; parentSessionId: string | null; cwd: string; nowIso: string },
): SessionSummary[] {
  if (!opts.parentSessionId) return base;
  return mergeLiveRoster(base, liveRosterFromTools(items, { ...opts, parentSessionId: opts.parentSessionId }));
}
```

Test:

```ts
it("sessionsWithLiveRoster no-ops without a parent id", () => {
  const base = [row({ id: "a" })];
  expect(sessionsWithLiveRoster(base, [], { agentId: "claude", parentSessionId: null, cwd: "/w", nowIso: "t" })).toBe(base);
});
```

`useAcpSession.ts` — add `src/lib/live-roster.ts` import and at the top of `resumeSession`:

```ts
if (isLiveRosterId(s.id)) {
  const parentId = s.parentSessionId;
  if (parentId) {
    const parent = { ...s, id: parentId, parentSessionId: null, sessionKind: null };
    return resumeSession(parent);
  }
  return;
}
```

That recursive shape is easy to get wrong. Prefer: in `useAppModel.openSession`:

```ts
async function openSession(s: SessionSummary) {
  const target = sessionToOpen(s, allSessionsRef.current ?? allSessions);
  // existing body using target instead of s
}
```

Add `src/lib/session-chrome.ts` is enough for listing. For resume guard, add `src/lib/live-roster.ts`:

```ts
export function assertNotLiveResume(id: string): void {
  if (isLiveRosterId(id)) {
    throw new Error("live-roster");
  }
}
```

Do **not** throw in production UI. Spec: no-op / open parent. Implement only `sessionToOpen` in `openSession` and skip `resumeSession` when `isLiveRosterId(s.id)` after redirect failed (no parent).

Test in `live-roster.test.ts` already has `sessionToOpen`. This task is wiring.

Add `src/hooks/useAppModel.ts` usage + a tiny `src/lib/live-roster.test.ts` for `sessionsWithLiveRoster`.

- [ ] **Step 2: Run the new helper test so it fails**

Run: `npx vitest run src/lib/live-roster.test.ts`

Expected: FAIL `sessionsWithLiveRoster` not exported.

- [ ] **Step 3: Implement helper + wire**

1. Export `sessionsWithLiveRoster` as in Step 1.
2. In `useAppModel`, after `applySessionUnion` builds `all` (or in the `useMemo` that feeds `allSessions` / `setSessions`):

Keep disk/ACP union as today. Derive:

```ts
const liveMerged = sessionsWithLiveRoster(unioned, chat.items, {
  agentId: selectedAgentId,
  parentSessionId: sessionId,
  cwd: cwd || "",
  nowIso: new Date().toISOString(),
});
```

`allSessions` must be that merged list (inbox + project split uses the same merge **before** `sessionInLibrary` filter). Live rows inherit `cwd` so they stay in the parent project.

3. `useEffect` on `parentsToExpandForLive(allSessions)`: `setCollapsedIds` delete those ids; `setExpandedIds` add them.

4. `openSession(s)` first line: `s = sessionToOpen(s, /* current allSessions */)`.

5. `resumeSession`: if `isLiveRosterId(s.id)` return after `openSession` already redirected; if something still calls resume with live id, `const t = sessionToOpen(s, []); if (t.id === s.id && isLiveRosterId(s.id)) return;`

Use a ref of all sessions if needed so `openSession` sees live rows.

- [ ] **Step 4: Run tests**

Run: `npx vitest run src/lib/live-roster.test.ts src/lib/session-chrome.test.ts src/lib/projects.test.ts src/lib/sidebar-list.test.ts`

Expected: PASS. Then `npx tsc -b --pretty false` — no new errors in `useAppModel.ts` / `useAcpSession.ts`.

- [ ] **Step 5: Commit**

```bash
git add src/lib/live-roster.ts src/lib/live-roster.test.ts src/hooks/useAppModel.ts src/hooks/useAcpSession.ts
git commit -m "$(cat <<'EOF'
feat: show running subagents as nested sidebar sessions

EOF
)"
```

---

### Task 7: Builtin AgentManifest

**Files:**
- Create: `src-tauri/src/agent_manifest.rs`
- Modify: `src-tauri/src/lib.rs` (`mod agent_manifest;`)
- Modify: `src/lib/agent-warmup.ts`
- Modify: `src/lib/agent-warmup.test.ts`
- Modify: `src/hooks/useAcpSession.ts` (pass `id` into `initializeTimeoutMs`)
- Test: `src-tauri/src/agent_manifest.rs` `#[cfg(test)]`

**Interfaces:**
- Consumes: `AgentId`
- Produces:

```rust
pub enum CatalogKind { GrokSummary, KimiSessions, ClaudeJsonl, CodexRollouts }

pub struct AgentManifest {
    pub id: AgentId,
    pub catalog: CatalogKind,
    pub home_rel: &'static str,
    pub subagent_aliases: &'static [&'static str],
    pub initialize_timeout_ms: u64,
}

pub fn manifest(id: AgentId) -> AgentManifest
```

TS:

```ts
export function initializeTimeoutMs(agentId?: AgentId): number
```

No-arg still returns 20_000 (keep existing test). With id, still 20_000 for all four.

- [ ] **Step 1: Write the failing tests**

Rust:

```rust
#[test]
fn builtin_manifests_cover_four_ids() {
    use crate::agent_host::AgentId;
    assert_eq!(manifest(AgentId::Claude).home_rel, ".claude");
    assert_eq!(manifest(AgentId::Claude).initialize_timeout_ms, 20_000);
    assert!(manifest(AgentId::Kimi).subagent_aliases.contains(&"swarm"));
    assert!(matches!(manifest(AgentId::Claude).catalog, CatalogKind::ClaudeJsonl));
    assert!(matches!(manifest(AgentId::Grok).catalog, CatalogKind::GrokSummary));
    assert_eq!(manifest(AgentId::Kimi).home_rel, ".kimi-code");
    assert_eq!(manifest(AgentId::Codex).home_rel, ".codex");
}
```

TS — keep the existing no-arg test; add:

```ts
it("keeps a 20s handshake per known agent", () => {
  expect(initializeTimeoutMs("claude")).toBe(20_000);
  expect(initializeTimeoutMs("codex")).toBe(20_000);
  expect(initializeTimeoutMs("kimi")).toBe(20_000);
  expect(initializeTimeoutMs("grok")).toBe(20_000);
});
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `cargo test --manifest-path src-tauri/Cargo.toml --lib builtin_manifests_cover -- --nocapture`

Expected: FAIL (module missing).

- [ ] **Step 3: Write minimal implementation**

`agent_manifest.rs` match on `AgentId` returning the four rows from the spec. Aliases: grok/claude/codex = `["spawn_subagent", "get_command_or_subagent_output", "task", "agent"]`; kimi adds `"swarm"`.

`initializeTimeoutMs(agentId?: AgentId)` in `agent-warmup.ts`: ignore the id for the numeric value (all 20_000) but accept the argument so call sites can pass the chip.

`useAcpSession` `rpc("initialize", ..., { timeoutMs: initializeTimeoutMs(id) })`.

Do **not** switch `scan_vendor_homes` to read `home_rel` in this task unless it is a one-line use of `manifest(id).home_rel`. Prefer leaving `scan_vendor_homes` paths as they are; Task 7 is the table, not a scan rewrite.

- [ ] **Step 4: Run tests**

Run: `cargo test --manifest-path src-tauri/Cargo.toml --lib builtin_manifests_cover`

Run: `npx vitest run src/lib/agent-warmup.test.ts`

Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add src-tauri/src/agent_manifest.rs src-tauri/src/lib.rs src/lib/agent-warmup.ts src/lib/agent-warmup.test.ts src/hooks/useAcpSession.ts
git commit -m "$(cat <<'EOF'
feat: add builtin agent manifests for catalog aliases and timeouts

EOF
)"
```

---

### Task 8: Spawn resolve helper, ACP parent overlay, HANDOFF

**Files:**
- Modify: `src-tauri/src/agent_host.rs` (`npx_adapter_resolves`)
- Modify: `src/lib/session-acp-list.ts`
- Modify: `src/lib/session-acp-list.test.ts`
- Modify: `docs/HANDOFF.md`

**Interfaces:**
- Consumes: `cached_npx_entry`, `parse_npx_pkg`, `mapOne`
- Produces: `npx_adapter_resolves`; `mapAcpListedSessions` sets `parentSessionId`; `unionSessionsById` keeps disk parent when ACP omits it

- [ ] **Step 1: Write the failing tests**

Rust in `agent_host.rs` tests:

```rust
#[test]
fn npx_adapter_resolves_with_cached_entry_and_node() {
    let root = std::env::temp_dir().join(format!("npx-resolve-{}", std::process::id()));
    let pkg = root.join("hash").join("node_modules").join("@agentclientprotocol").join("claude-agent-acp");
    std::fs::create_dir_all(pkg.join("dist")).unwrap();
    std::fs::write(pkg.join("package.json"), r#"{"version":"0.70.0"}"#).unwrap();
    std::fs::write(pkg.join("dist").join("index.js"), "1").unwrap();
    let node = root.join("node");
    std::fs::write(&node, "").unwrap();
    assert!(npx_adapter_resolves(
        "@agentclientprotocol/claude-agent-acp@0.70.0",
        &root,
        |_| Some(node.clone()),
    ));
    assert!(!npx_adapter_resolves(
        "@agentclientprotocol/claude-agent-acp@0.70.0",
        &root.join("missing"),
        |_| None,
    ));
    std::fs::remove_dir_all(root).ok();
}
```

`npx_adapter_resolves` is true if `spawn_npx_adapter` would not be stuck with command `npx` **and** lookup of both node and cache failed — actually spec: true when cache+node **or** `npx` on PATH.

```rust
pub fn npx_adapter_resolves(
    pkg: &str,
    npx_root: &Path,
    lookup: impl Fn(&str) -> Option<PathBuf>,
) -> bool {
    lookup("npx").is_some() || {
        let (cmd, _) = spawn_npx_adapter(pkg, npx_root, &lookup);
        cmd.file_name().and_then(|n| n.to_str()) == Some("node")
    }
}
```

False only when lookup("npx") is None **and** spawn falls back to PathBuf `npx` because cache/node missing.

TS in `session-acp-list.test.ts`:

```ts
it("maps parentSessionId from ACP rows", () => {
  const rows = mapAcpListedSessions(
    { sessions: [{ sessionId: "child", cwd: "/w", parentSessionId: "parent" }] },
    "kimi",
  );
  expect(rows[0].parentSessionId).toBe("parent");
});

it("keeps disk parent when ACP omits it", () => {
  const disk = [row({ id: "child", agentId: "kimi", parentSessionId: "parent", title: "disk" })];
  const acp = [row({ id: "child", agentId: "kimi", title: "acp" })];
  const out = unionSessionsById(disk, acp);
  expect(out[0].title).toBe("acp");
  expect(out[0].parentSessionId).toBe("parent");
});
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `cargo test --manifest-path src-tauri/Cargo.toml --lib npx_adapter_resolves_with_cached -- --nocapture`

Run: `npx vitest run src/lib/session-acp-list.test.ts`

Expected: FAIL.

- [ ] **Step 3: Write minimal implementation**

`mapOne`: `parentSessionId: stringField(rec, "parentSessionId") || stringField(meta, "parentSessionId") || undefined` (empty string → omit).

`unionSessionsById`: when replacing disk with acp, if `!acp.parentSessionId && disk.parentSessionId`, copy parent and `sessionKind` from disk.

HANDOFF.md — add a short subsection after “How to add an agent”:

```
## Subagents and session catalog

- Disk: Grok `subagents/meta.json`; Claude `<uuid>/subagents/agent-*.jsonl`; Kimi `agents/<id>` except `main`.
- Live: tool aliases in `src/lib/subagent.ts` (Task, Agent, spawn_subagent, swarm). Running tools become `live:{agentId}:{toolId}` nested rows. Never session/load those ids.
- Manifest: `src-tauri/src/agent_manifest.rs`. Spawn argv still `agents.toml` + `adapters.rs`.
```

- [ ] **Step 4: Run tests + typecheck**

Run: `cargo test --manifest-path src-tauri/Cargo.toml --lib`

Run: `npx vitest run src/lib/session-acp-list.test.ts src/lib/live-roster.test.ts src/lib/subagent.test.ts src/lib/agent-warmup.test.ts`

Run: `npx tsc -b --pretty false`

Expected: PASS / no errors.

- [ ] **Step 5: Commit**

```bash
git add src-tauri/src/agent_host.rs src/lib/session-acp-list.ts src/lib/session-acp-list.test.ts docs/HANDOFF.md
git commit -m "$(cat <<'EOF'
feat: overlay ACP parents and document multi-brand subagent catalog

EOF
)"
```

---

## Spec coverage

| Spec section | Task |
|---|---|
| ScannedSession parent/kind + list_sessions copy | 1 |
| Claude subagents dir | 2 |
| Kimi agents/ | 3 |
| Codex rollouts unchanged | 1 (defaults None) |
| Tool aliases + display name | 4 |
| Live roster + isEmptyDraft | 5 |
| Sidebar wire, auto-expand, live click | 6 |
| AgentManifest + initializeTimeoutMs(agentId) | 7 |
| npx_adapter_resolves, ACP parent overlay, HANDOFF | 8 |
| Grok attach_subagent_parents | unchanged, still in `lib.rs` |
| No acpSpawnOk on doctor DTO | 8 (do not add it) |
| No pin / package change | 8 |

## Self-review

- No TBD / “implement later”.
- Types: `sessionKind: "subagent"`, live id `live:{agentId}:{toolCallId}`, `CatalogKind` four variants.
- `initializeTimeoutMs` remains 20_000; argument is for call-site honesty.
- Task 6 is the only `useAppModel` integration; helpers are tested in isolation so a reviewer can reject wiring without rejecting the catalog.
