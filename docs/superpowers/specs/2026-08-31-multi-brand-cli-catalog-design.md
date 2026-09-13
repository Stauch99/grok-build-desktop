# Multi-brand CLI catalog and spawn

Date: 2026-08-31
Status: approved (A + B in one spec; implement A then B)
Product: Grok Build Desktop
Depends on: `docs/superpowers/specs/2026-08-30-multi-agent-acp-workbench-design.md` (AgentPort, closed `AgentId`, `~/.agents` hub). This spec does not reopen those decisions.

## Goal

The left session list shows **parent chats and their subagents** for Grok, Kimi, Claude, and Codex. Spawn, disk layout, tool-name aliases, and initialize timeout come from a **builtin manifest table**, not from Grok-shaped `if`s. Adding a fifth CLI is: extend the closed `AgentId` enum + one manifest row. Do not fork acp-ui, kimi-web, or parse-cc; copy only their layout and spawn rules.

Success for the screenshot bug: while Claude (or any enabled CLI) has N in-progress Task/Agent/spawn tools, the sidebar nests N child rows under the open session. After they finish, disk children remain nested if the vendor wrote them.

## Approaches (locked)

1. **Chosen — manifest + disk catalog + live roster.** Builtin `AgentManifest` per `AgentId`. Disk scanners fill `parentSessionId` / `sessionKind`. ACP `session/update` tool rows become **ephemeral** children while running. UI keeps using `nestByParent` / `SessionBranch`.
2. **Rejected — vendor acp-ui / kimi-web as the chrome.** Vue vs this React/Tauri workbench. Dual session lists. License and IA conflict.
3. **Rejected — ACP `session/list` only.** Claude/Codex `npx` handshake was empty on 2026-08-31. Live Task tools are not sessions until flushed. Disk layout is the durable catalog; `session/list` is an overlay.

## Architecture

```
ACP session/update (tool titles)
        │
        ▼
liveRoster(items, agentId, parent)  ──ephemeral SessionSummary──┐
                                                                │
disk scan (per CatalogKind)  ──parentSessionId, sessionKind──► union ──► sidebar nestByParent
                                                                │
ACP session/list (if advertised)  ──overlay by agentId/id───────┘

spawn/handshake ◄── AgentManifest (command, args, pin, timeoutMs, catalog, aliases)
                     agents.toml overrides command/args only
```

Rules:

- One ACP child per `AgentId` (unchanged).
- `SessionSummary.parentSessionId` is the only nesting key. Do not add a second tree type.
- Live rows never invent a vendor session id. Id prefix: `live:{agentId}:{toolCallId}`.
- Live rows exist only while the tool status is `pending` or `in_progress`. Completed work stays on disk or disappears.
- Do not parse vendor message bodies. Catalog reads layout + a few documented metadata keys (`cwd`, `sessionId`, `customTitle`, `title`, `workDir`, Kimi `state.json`).
- `AgentId` stays `"grok" | "kimi" | "claude" | "codex"`. Manifests do not introduce a stringly-typed fifth id in this spec.

## A — Session catalog

### Shared row

`ScannedSession` gains:

```rust
pub parent_session_id: Option<String>,
pub session_kind: Option<String>, // None | Some("subagent")
```

`list_sessions` copies both onto `SessionSummary`. Today it writes `None` / `None` for every vendor row. That is the list bug.

Child rows **inherit the parent `cwd`**. Empty cwd would send them to inbox.

### Grok — `CatalogKind::GrokSummary`

Unchanged walk of `~/.grok/sessions/**/summary.json`. Keep `attach_subagent_parents` (`<dir>/subagents/meta.json` → `child_session_id` / `subagent_id` + `parent_session_id`).

### Claude — `CatalogKind::ClaudeJsonl`

Layout copied from parse-cc / clog (do not vendor those repos):

```
~/.claude/projects/<slug>/
  <parent-uuid>.jsonl
  <parent-uuid>/subagents/agent-<agent-uuid>.jsonl
```

- Top-level `*.jsonl` in the slug dir = parent (existing `parse_claude_jsonl`).
- Do not treat `memory/*.jsonl` as sessions (already skipped by “only immediate jsonl”).
- For each parent file stem `P`, if `P/subagents/` exists, each `agent-*.jsonl` whose name does **not** contain `prompt_suggestion` is a child:
  - `id` = filename stem without `agent-` prefix if present, else stem
  - `parent_session_id` = `P` (the parent file stem / `sessionId` from the parent file)
  - `session_kind` = `"subagent"`
  - `cwd` = parent cwd
  - `title` = first 80 lines: `customTitle` else stem
- `isSidechain` is not required to list the file; the path is the contract.

### Kimi — `CatalogKind::KimiSessions`

Existing: `~/.kimi-code/sessions/<wd_*>/session_*` via `state.json`.

Add, per `session_*` directory:

```
agents/main/wire.jsonl          # not a sidebar row
agents/<subId>/wire.jsonl       # child
```

- Skip names `main`, empty, or starting with `.`
- Child `id` = `<subId>` (opaque)
- `parent_session_id` = parent `session_*` id
- `session_kind` = `"subagent"`
- `cwd` / `title` from parent `state.json` if the child has no own `state.json`

Do not scrape `wire.jsonl`.

### Codex — `CatalogKind::CodexRollouts`

Keep `~/.codex/sessions/YYYY/MM/DD/rollout-*.jsonl` + first-line `session_meta`. No invented subagent directory. Nesting for Codex is live roster + ACP `session/list` `parentSessionId` when present.

### ACP overlay

`mapAcpListedSessions` reads `parentSessionId` / `_meta.parentSessionId`.

`unionSessionsById`: ACP still wins on `agentId/id`. If the ACP row has no `parentSessionId`, keep the disk row’s parent and `sessionKind`.

## A — Live roster

### Tool aliases

`subagentStatusFromTool(title, status)` today only matches `spawn_subagent` and `get_command_or_subagent_output`. Claude’s screenshot uses `Task` / `Agent`.

Matching:

1. Normalize: lower case, trim, `[- ]+` → `_`.
2. Take the first token (split on `_` after replacing `:` `(` with `_`).
3. That token (or the whole normalized string starting with an alias) must be in the **union** of default aliases and the current agent’s manifest aliases.
4. Status map unchanged: pending/in_progress/running → `running`; completed/complete/success → `completed`; cancelled/canceled → `cancelled`; failed/error/failure → `failed`; else `null`.

Default aliases (all agents): `spawn_subagent`, `get_command_or_subagent_output`, `task`, `agent`.

Per-agent extras (manifest):

| Agent | Extra |
|---|---|
| grok | (defaults only) |
| kimi | `swarm` |
| claude | (defaults only) |
| codex | (defaults only) |

`bash`, a bare `subagent` token, and unknown statuses still return `null` (existing tests stay).

Display name: strip a known alias prefix plus optional `:` / whitespace; if empty, use the raw title. Example: `Task: 中文技巧` → `中文技巧`.

### Synthetic rows

```ts
type LiveSubagent = {
  id: string;           // live:{agentId}:{toolCallId}
  parentSessionId: string;
  agentId: AgentId;
  title: string;
  status: "running";
  cwd: string;
};

function liveRosterFromTools(
  items: ChatItem[],
  opts: { agentId: AgentId; parentSessionId: string; cwd: string },
): SessionSummary[]
```

Only tools whose mapped status is `running`. `sessionKind: "subagent"`. `numMessages: 1` so `isEmptyDraft` does not drop them. `dir: null`. `updatedAt` = now ISO.

`mergeLiveRoster(diskAndAcp: SessionSummary[], live: SessionSummary[]): SessionSummary[]` appends live rows whose `id` is not already in the list.

### Sidebar

Default grouping is `project`. `Sidebar` already calls `nestByParent` on section rows. Filling `parentSessionId` is sufficient for nesting.

`statusFor(liveId)` is `working` while the tool is in progress (`busyIds` should include live ids **or** `deriveStatus` sees them in `busyIds`).

While any live child of `P` is running, `P` must not stay in `collapsedIds` (auto-expand). Do not persist that expansion as a user preference.

Clicking a `live:` row does not call `session/load`. It is a no-op if the parent is focused; otherwise it opens the parent. Do not resume a synthetic id.

Thread `SubagentCard` / `subagentCatalog` use the same matcher so the composer strip and the list agree.

## B — Manifest and spawn

### `AgentManifest`

Rust source of truth (TS mirrors aliases + timeout only if the UI needs them; disk/spawn stay in Rust):

```rust
pub struct AgentManifest {
    pub id: AgentId,
    pub catalog: CatalogKind, // GrokSummary | KimiSessions | ClaudeJsonl | CodexRollouts
    pub home_rel: &'static str, // ".grok" | ".kimi-code" | ".claude" | ".codex"
    pub subagent_aliases: &'static [&'static str],
    pub initialize_timeout_ms: u64,
}
```

Spawn remains `default_spawn_profile` + `agents.toml` override (already implemented). Manifest does not replace toml. Manifest **does** own catalog kind, aliases, and initialize timeout.

Builtin timeouts: grok 20_000; kimi 20_000; claude 20_000; codex 20_000. Same number as today’s `initializeTimeoutMs()`. Per-agent function `initializeTimeoutMs(agentId: AgentId)` so a later pin bump can change one CLI without a global.

### Handshake (honest, not a new protocol)

Facts from `docs/superpowers/specs/acp-probe/README.md`: `npx -y` Claude/Codex produced 0 stdout in 12s. `spawn_npx_adapter` already prefers `node <cached dist/index.js>` and sets `CLAUDE_CODE_EXECUTABLE` / `CODEX_PATH`.

Do **not** add `acpSpawnOk` to `AgentDoctorDto`. That field was removed because a constant `false` lied. Handshake honesty stays in initialize timeout + spawn resolution:

1. `npx_adapter_resolves(pkg, npx_root, lookup_node)` is true when cached `dist/index.js` exists **or** `npx` is on PATH. False only when both the cache and `npx`/`node` lookup fail. Unit-test with temp dirs; no live CLI.
2. Keep extra spawn env (`CLAUDE_CODE_EXECUTABLE` / `CODEX_PATH`).
3. `initializeTimeoutMs(agentId)` returns the manifest timeout (20_000 for all four today).
4. `session/list` remains best-effort after initialize (`afterInitializeFetchSessionList`).

Do not switch Codex to `@zed-industries/codex-acp` or use `@latest`. Pins stay `CLAUDE_ACP_PKG` / `CODEX_ACP_PKG` in `agent_host.rs`.

### Extensibility

To add Gemini later (out of this implementation): new `AgentId` variant, one `AgentManifest` row, one `CatalogKind` or `AcpListOnly`, doctor home, tests. UI must not grow `if (agent === "gemini")` for the session list.

## Error handling

- Missing vendor home → `[]`, never error `list_sessions`.
- Unreadable jsonl line → skip line, keep the file if an id exists.
- Live merge is frontend-only; a failed `list_sessions` still shows live children of the open session.
- `session/load` of a `live:` id must not be sent. Guard in `openSession` / `resumeSession`: if `id.startsWith("live:")`, open the parent instead.

## Testing

- Rust: temp dirs only. Claude fixture with parent jsonl + two `subagents/agent-*.jsonl` + one `prompt_suggestion` file. Kimi fixture with `agents/main` and `agents/researcher`. `list_sessions` mapping test for parent copy.
- TS: matcher titles (`Task: 中文技巧`, `Agent`, `swarm`, `bash`). `liveRosterFromTools` running vs completed. `mergeLiveRoster` no duplicate ids. `isEmptyDraft` false for `sessionKind: "subagent"`. `unionSessionsById` keeps disk parent when ACP omits it. `initializeTimeoutMs("claude")` is 20_000.
- Rust: `npx_adapter_resolves` true with fake cache+node, false when both missing.

## Out of scope

- Opening a subagent jsonl as its own ACP `session/load` (vendors may not resume Task sidechains).
- In-app PTY, plugins, imagine/video, fifth AgentId.
- Vendoring acp-ui, kimi-web, parse-cc, clog.
- Changing ACP pins or rewriting `acp_loop`.
- Sidebar grouping mode `agent` (already optional in the 08-30 spec; not required here).

## File map

| File | Role |
|---|---|
| `src-tauri/src/session_scan.rs` | Parent/child fields; Claude subagents dir; Kimi `agents/` |
| `src-tauri/src/lib.rs` | Copy parent/kind in `list_sessions` |
| `src-tauri/src/agent_manifest.rs` | Builtin manifests |
| `src-tauri/src/agent_host.rs` | `npx_adapter_resolves`; manifest timeouts |
| `src/lib/subagent.ts` | Alias matcher + display name |
| `src/lib/live-roster.ts` | Synthetic rows + merge |
| `src/lib/session-chrome.ts` | `isEmptyDraft` exception |
| `src/lib/session-acp-list.ts` | Parent overlay |
| `src/lib/agent-warmup.ts` | `initializeTimeoutMs(agentId)` |
| `src/hooks/useAppModel.ts` | Merge live roster; auto-expand; live click |
| `src/hooks/useAcpSession.ts` | Timeout by agent; refuse `live:` resume |
| `docs/HANDOFF.md` | Catalog + live roster + manifest row checklist |
