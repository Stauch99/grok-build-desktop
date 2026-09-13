# User Memory and Daily Dreaming

Date: 2026-08-30
Status: approved
Product: Grok Build Desktop / ACP Workbench
Depends on: `2026-08-30-multi-agent-acp-workbench-design.md` (AdminPort session readers, `~/.acp-workbench`)

## Goal

Give the desktop a **user-level** memory: one profile of the human, built by digesting conversations across projects and across agents. Once a day the desktop “dreams”: it consolidates that day’s material into a readable diary and, when gates pass, into a durable `USER.md`. The next new session of **any** agent receives a compact slice of that profile on its first prompt.

The desktop still does not own the agent runtime. Dreaming is a background ACP session on a user-chosen CLI, not a second product.

## Locked product decisions (2026-08-30)

1. **Approach C** — Workbench-owned Memory Host. Copy the OpenClaw `memory-core` *operating model* (file layers, Light → REM → Deep, diary ≠ durable, promotion gates, reviewable rollback). Do not vendor OpenClaw, Letta, Mem0, Graphiti, Hindsight, or claude-mem.
2. **One `USER.md`** — the profile is of the user, not of an agent. All enabled agents’ transcripts feed the same daily file and the same profile.
3. **Inject on first prompt** — compact `USER.md` is prepended to the first `session/prompt` of a new session. Do not send a hidden turn after `session/new`. Do not depend on Grok-only `_meta`.
4. **Dream runner is one CLI** — Settings pick a default agent (default `grok`) that runs Light/REM/Deep. Ingest is not limited to that agent.
5. **Contradiction does not auto-overwrite** — two agents that disagree are noted in the diary; Deep does not silently replace the existing `USER.md` entry.
6. **No intimacy / growth game** in this spec. No heatmap in P0. No write-back into each CLI’s native `MEMORY.md` (that is a later spec).

Out of scope: replacing ACP with Letta; embedding OpenClaw Gateway; per-project dreams that later merge; cloud memory APIs; rewriting CLI memory systems.

## Why not reuse a product

| Candidate | Verdict |
|---|---|
| OpenClaw memory-core | Reuse the contract only. The plugin is bound to OpenClaw’s gateway and cron. |
| Letta sleeptime | Reject. It is an agent runtime and conflicts with the ACP workbench. |
| Mem0 | Reject as the host. Fact extraction without a diary or a “who you are” narrative still requires ingest, schedule, UI, and inject. |
| Graphiti / Hindsight | Reject for P0. Extra graph/Postgres infrastructure. |
| claude-mem | Different job (code-session retrieval). Do not merge products. |

This matches the workbench rule already used for Skills/MCP: copy the operating model, do not vendor the other product.

## Current state

Today’s Memory overlay edits the **project** `MEMORY.md` and `AGENTS.md`. `MemoryWorkspace` states the desktop does not invent another memory product. `list_memory_changes` watches `~/.grok/memory`. Settings “跨会话记忆” toggles Grok CLI `memory.enabled`.

That layer stays. This spec adds a second, user-level layer. The two are not the same switch and not the same files.

## Architecture

```
Agent transcripts (grok | kimi | claude | codex)
        │  SessionIngest via AdminPort.read_session_updates
        │  (P0: Grok updates.jsonl; others as each adapter lands)
        ▼
Memory Host  (~/.acp-workbench/memory/)
  SessionIngest   daily/YYYY-MM-DD.md   tagged agentId + sessionId
  DreamJob        Light → REM → Deep    runs on settings.dreamAgentId
  MemoryStore     USER.md, DREAMS.md, .dreams/state.sqlite
        │
        ├─ Deep may rewrite USER.md (snapshot first; validate or rollback)
        └─ SessionInject prepends compact USER.md on first session/prompt
```

Four units. Each has one job and a testable boundary.

| Unit | Does | Callers use | Depends on |
|---|---|---|---|
| **MemoryStore** | Read/write `USER.md`, `DREAMS.md`, daily files, sqlite (cursors, lock, preimage) | Paths and structured entries only | Disk under `~/.acp-workbench/memory/` |
| **SessionIngest** | Pull new user-facing turns since cursor, redact, append daily | `ingest(agentId) → { sessions, turns }` | AdminPort session readers |
| **DreamJob** | Gates → lock → Light → REM → Deep → unlock | `run(trigger)` | Store, Ingest, one ACP child of `dreamAgentId` |
| **SessionInject** | On first prompt of a session, optionally prepend compact profile | `wrapPrompt(sessionId, text)` | Store + inject setting |

Project `MEMORY.md` / `AGENTS.md` stay on the existing overlay path. DreamJob never writes them.

## Storage

Root: `$ACP_WORKBENCH_HOME/memory/` (default `~/.acp-workbench/memory/`).

```
USER.md                 durable user profile (style, habits, hard nos, standing prefs)
DREAMS.md               human diary; append-only; not a promotion source
daily/YYYY-MM-DD.md     fused digest draft for that local calendar day
.dreams/state.sqlite    cursors, lock, phase signals, USER.md preimage, forgotten session ids
```

`USER.md` budget: 8 KiB. Compact inject slice: 4000 characters, trimmed by section from the top, never mid-sentence if a section boundary exists.

Daily entries must carry:

```
agentId, sessionId, kind (user_pref | user_utterance | agent_commitment), source line ref
```

Do not store tool output, web-fetch bodies, subagent transcripts, or raw secrets (API keys, tokens, PEM). Redact those in Ingest before daily write.

Timezone for day buckets and the 03:00 timer: the OS local timezone.

## Fusion (all agents → one profile)

`USER.md` is singular. SessionIngest is keyed by `agentId` from day one; it is not a Grok-only function.

- P0 ships the Grok reader (`~/.grok/sessions/**/updates.jsonl`).
- Kimi / Claude / Codex readers attach to the same daily file as soon as `AdminPort.read_session_updates` exists for that agent. No per-agent dream, no later merge step.
- Overlay status lists only agents that contributed today, e.g. `今日语料：Grok 4 · Claude 2`.
- The same fact from two agents increases Deep score (frequency + query diversity).
- Contradictory facts: REM writes the conflict into that day’s diary. Deep **leaves the existing `USER.md` line unchanged**. The user edits `USER.md` or settles it in a later conversation.

Cursor identity: `{ agentId, sessionId, byteOffset }`. A turn is ingested at most once.

Forgotten sessions: an id recorded in sqlite as `forgotten` is skipped on future ingest. Forgetting does not rewrite old daily files. P0 has no forget button in the overlay; the skip list exists so tests and a later UI can mark ids without changing Ingest.

## DreamJob

Dreaming uses a **dedicated** ACP session on `settings.dreamAgentId` (default `grok`). Cwd is `~/.acp-workbench/memory/` so the runner can read `USER.md`, `DREAMS.md`, and `daily/`. The live chat session is never reused. The job closes the dream session when finished.

Each phase is one `session/prompt`. The prompt names the input files and the required output shape (markdown sections). Light and REM must not ask the model to edit `USER.md`. Deep’s model output is a candidate `USER.md`; the host runs the validators and only then replaces the file.

If `dreamAgentId` is not logged in at run time: fail visibly (`做梦失败：{agent} 未登录`). Do **not** fall back to another CLI.

### Gates (all must pass)

1. `dreaming.enabled` is true.
2. At least 20 hours since the last completed Deep (manual `/dream` skips this gate).
3. At least 10 minutes since the last scan.
4. At least one newly ingested session since the last Deep (manual `/dream` skips this gate).
5. Sqlite lock is free.

Triggers: in-app timer at 03:00 local while the app is open; **catch-up on next launch** if the window was missed. No always-on daemon. Command palette and `/dream` start a manual run (still honor lock + enabled).

### Phases

| Phase | Reads | Writes | On failure |
|---|---|---|---|
| Light | New turns since cursors (all agents that have a reader) | `daily/YYYY-MM-DD.md` | Record error, abort the sweep |
| REM | Today’s daily + last 7 daily files | Append one diary entry to `DREAMS.md`; stage scored candidates | Diary may be skipped; staged candidates may still go to Deep |
| Deep | Staging + current `USER.md` | Rewrite `USER.md` only if gates and validators pass | Restore preimage; diary line `未晋升` |

Deep promotion gates (all required). P0 has no retrieval engine, so the three OpenClaw names map to local counts:

| Gate | Threshold | Meaning here |
|---|---|---|
| `minScore` | 0.7 | Dream model’s 0–1 confidence on the staged line |
| `minRecallCount` | 3 | Distinct `sessionId`s that supported the line |
| `minUniqueQueries` | 3 | Distinct `(agentId, cwd)` pairs that supported the line |

Diary text is never fed back as a candidate.

### `USER.md` write safety

Before rewrite, store the full previous file in sqlite. The new draft must:

1. Keep at least `1 - 0.2` of prior entries (max 20% loss).
2. Include a `Source:` ref for every newly promoted line.
3. Stay ≤ 8 KiB.
4. Parse as the expected sectioned markdown (heading + bullet entries).

Any failure → restore preimage. The user still sees the old profile.

## SessionInject

Applies to **every** new session of every agent, independent of `dreamAgentId`.

Rules:

- Only the first `session/prompt` of that `sessionId`.
- Only if Settings “用户画像注入” is on.
- Only if compact `USER.md` is non-empty after trim.
- Prepend the compact block to the ACP prompt text. The composer and the user bubble show the user’s words only.
- On success, show a dismissible chip “已加载记忆” above the composer. Click opens the Memory overlay on the profile. Dismiss hides the chip for that session; it does not turn the setting off.
- If wrap fails (file unreadable, oversize after trim still empty): send the original prompt. No toast. No chip.

A Deep rewrite of `USER.md` does not re-inject into sessions already started. Only the next `session/new` is affected.

Do not inject via a second `session/prompt` after `session/new` (that would make the agent speak first). Do not require Grok `_meta`.

## UI

Entry points unchanged: Extra overlay “记忆”, command palette, `/memory`.

Overlay layout:

- **Left:** latest `DREAMS.md` entry (date + body) and a status line (`上次做梦 · …` / `有 N 场会话待消化` / `做梦失败，将在下次启动重试` / `正在做梦`). Actions: `做一场梦`, `打开 USER.md`.
- **Right:** timeline of days that have a dream entry. Clicking a day swaps the left pane. Days without a dream are omitted.
- **Bottom, collapsed:** existing project `MEMORY.md` + `AGENTS.md` editor for the current cwd.

Thread: inject chip only, as above.

`MemoryDock` keeps watching CLI `~/.grok/memory` (and later each agent’s native memory dir). After a successful Deep rewrite, the same dock also offers “画像已更新”; click opens this overlay.

P0 does not add a heatmap, intimacy tab, growth score, or a new top-level route.

## Settings

Settings → 对话, three new rows next to the existing Grok “跨会话记忆”:

| Key | Default | Effect |
|---|---|---|
| 用户画像注入 (`injectUserMemory`) | on | First-prompt wrap |
| 每天自动做梦 (`dreaming.enabled`) | on | Timer + launch catch-up |
| 做梦使用 (`dreamAgentId`) | `grok` | Which logged-in agent runs DreamJob |

`dreamAgentId` options are agents that `doctor` reports as logged in. Saving an agent that is not logged in is rejected. Turning inject off does **not** stop dreaming. Turning dreaming off does **not** clear `USER.md` or disable inject.

These keys live in `~/.acp-workbench/workbench.json` (until that file exists, `~/.grok/webui.json`). They are not Grok `config.toml` `memory.enabled`.

## Data flow

**Talk path:** `session/new` → user sends first prompt → `SessionInject.wrapPrompt` → `session/prompt` with optional prefix → chip or silent original.

**Dream path:** launch or 03:00 → gates → lock → Ingest all agents with readers → Light → REM → Deep (snapshot, validate, commit or rollback) → unlock → dock if `USER.md` changed.

**Manual path:** `/dream` or overlay button → same as dream path, skipping the 20-hour and “one new session” gates.

## Errors (never block chat)

| Case | Surface |
|---|---|
| Dream running | Overlay status “正在做梦”; dream button disabled |
| ACP / model failure | Overlay “做梦失败，将在下次启动重试”; keep any daily already written |
| `dreamAgentId` logged out | Overlay “做梦失败：{agent} 未登录” |
| Deep validation fail | Rollback `USER.md`; diary “未晋升” |
| Compact over 4000 chars | Trim by section; chip still shown |
| Lock held | Manual run toasts “已有一场梦在跑” |
| Inject off or empty profile | Original prompt, no chip, no error |

## Testing

No live model in unit tests. Fixture transcripts only.

Must cover:

- Gates (enabled, 20h, 10min, one session, lock); manual skips of 20h and one-session.
- Cursor `{ agentId, sessionId, byteOffset }` does not double-ingest.
- Day bucket in local timezone.
- Compact trim to 4000 characters on section boundaries.
- Inject once per `sessionId`; inject off sends original text.
- Fusion: two agents in one daily file; same fact raises score; contradiction leaves `USER.md` line unchanged.
- `USER.md` validators: too much prior loss, missing `Source:`, over 8 KiB → rollback to preimage.
- Ingest skips tool output, subagent turns, forgotten ids, secret-shaped strings.
- DreamJob refuses to start when `dreamAgentId` is not logged in (no fallback).
- UI: empty diary, one entry, chip show/hide, project-file fold still renders `MEMORY.md` / `AGENTS.md` rows.

## P0 / later

**P0 (this spec’s implementation plan):**

- MemoryStore + sqlite lock/cursors/preimage
- SessionIngest interface + Grok `updates.jsonl` reader
- DreamJob gates, three phases, USER.md validators
- SessionInject on first prompt + chip
- Memory overlay two-pane + collapsed project files
- Settings: inject, dreaming, `dreamAgentId`
- Launch catch-up + in-app 03:00 timer
- `/dream` and overlay “做一场梦”

**After AdminPort readers exist (same Memory Host, no redesign):** Kimi, Claude, Codex ingest.

**Later specs, not this one:** contribution heatmap; intimacy/growth; sync compact profile into each CLI’s native `MEMORY.md`; per-agent dream diaries.

## Relationship to the workbench spec

- Home is `~/.acp-workbench/memory/`, same root as usage.
- Ingest calls `AdminPort.read_session_updates` when that method exists; until then Grok uses the current `read_session_updates` Tauri command.
- Inject is ACP-generic (`session/prompt` text). Adapters do not each invent a memory RPC.
- Memory overlay stays one page for the workbench, not one page per agent. Project `MEMORY.md` at the bottom remains cwd-scoped.

## Non-goals (explicit)

- Do not write `~/.grok/memory/**/MEMORY.md` or other CLI memory trees.
- Do not start a second long-lived agent process just for memory beyond the short dream ACP session.
- Do not show diary text as a user or assistant bubble in the thread.
- Do not treat `DREAMS.md` as ingest input.
- Do not silently switch `dreamAgentId` when the chosen CLI is offline.
