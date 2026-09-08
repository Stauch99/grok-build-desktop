# Memory Dreaming Overflow and Catch-up

Date: 2026-09-08
Status: draft
Product: Grok Build Desktop / ACP Workbench
Amends: `docs/superpowers/specs/2026-08-30-user-memory-dreaming-design.md`
Evidence: live host at `~/.acp-workbench/memory/.dreams/state.json` (`lastError: file exceeds 64 KiB size limit`, `lastDeepAt: null`, `cursors: {}`); GitHub survey of OpenClaw memory-core, Letta/MemGPT, Mem0, Graphiti/Zep, Hindsight, LangMem, claude-mem, Cognee, MemOS, Supermemory.

## Goal

Keep the workbench-owned Memory Host. Make ingest and dreaming survive a large session backlog without failing the whole sweep, without sending conversation text to a cloud memory API, and without inventing a map-reduce summarizer.

The 2026-08-30 spec remains the product: one `USER.md`, one diary, first-prompt inject, one dream CLI, contradiction does not auto-overwrite. This amendment only fills the overflow contract that spec copied from OpenClaw in name and then left unimplemented.

## Why this exists

On 2026-09-08 the host recorded `lastStatus: failed` and `lastError: file exceeds 64 KiB size limit`. `USER.md`, `DREAMS.md`, and `daily/*.md` were empty. Cursors never advanced, so every retry re-scanned the full transcript set (hundreds of sessions, estimated ~800 KiB of formatted user lines) and hit the same cap.

The 64 KiB guard in `memory_host.rs` is a write-time hard fail on the whole `writeMemoryHost` patch. Ingest, lock, and cursors share that patch. A fat `dailyMd` aborts state persistence. That is the opposite of the surveyed systems.

## Locked decisions (2026-09-08)

1. **Do not vendor Mem0, Letta, Graphiti, Hindsight, or claude-mem.** Mem0's MCP covers Claude Code / Codex / Kimi / Cursor as a fact store the *agent* may call. It does not ingest ACP `session/update` streams, does not include Grok CLI, does not produce `USER.md` / `DREAMS.md`, and the hosted MCP stores memory in a Mem0 account. OSS Mem0 still needs an LLM plus a vector store. The workbench already distributes `grok-build-memory` into the four CLI configs; that sidecar stays.

2. **Do not map-reduce the backlog into `USER.md`.** No surveyed host folds a whole transcript into the curated file via group-summarize-then-merge. OpenClaw, Letta, Mem0, Graphiti, and Hindsight all extract or promote from a *bounded slice*, with a watermark. Chunking is for model windows and search, not for rewriting the profile.

3. **Copy OpenClaw's overflow contract, not its gateway.** Raw transcripts stay in `updates.jsonl`. Daily files are a bounded staging area. Cursors / hashes / lock live in `.dreams/state.json` and persist even when a daily write is truncated. Dreaming reads a lookback window and a line limit. Historical catch-up is a separate backfill loop, oldest unprocessed material first, bounded batches, reversible.

4. **Two budgets, two failure domains.**
   - Staging (`daily/*.md`): 64 KiB *per shard*. Overflow opens the next shard or pauses ingest. It never fails cursor persistence.
   - Hot layer (`USER.md`): 8 KiB on disk as today; inject slice 4000 characters as today. Overflow truncates the injected copy (already true) and rejects an oversized Deep rewrite (already true). It never fails ingest.

5. **Nightly dream stays one ACP prompt.** Light / REM / Deep remain collapsed into the current `main` phase. Catch-up is repeated bounded sweeps, not one giant prompt and not N summary-of-summaries.

## What we are not building

- Raising `MAX_FILE_BYTES` as the fix.
- Grouping by 64 KiB and merging group diaries into `USER.md`.
- Cloud memory APIs.
- A graph database or sqlite migration in this amendment (`state.json` stays; the 2026-08-30 sqlite mention remains follow-on).
- Per-agent profiles or write-back into each CLI's native `MEMORY.md`.

## Architecture

```
updates.jsonl  (raw, unbounded, source of truth for turns)
        │  SessionIngest: clip line, fill shard to 64 KiB, advance cursor only for written rows
        ▼
daily/YYYY-MM-DD.md
daily/YYYY-MM-DD.2.md   bounded staging, never the inject payload
        │  DreamJob: select ≤40 lines / 6000 chars from lookback shards
        ▼
USER.md (≤8 KiB)     DREAMS.md (append-only diary)
.dreams/state.json   cursors, lock, lastStatus, lastError  — written independently
```

Four rules the live code currently violates:

| Rule | Today | After |
|---|---|---|
| Cursor vs body | One `persistIo` sends user + dreams + daily + state. Fat daily aborts all four. | `writeMemoryHost` already accepts partial patches. Ingest writes `stateJson` (+ daily if it fits). Dream writes USER / DREAMS / state. |
| Line size | Full user utterance in the daily line. One paste was ~47 KiB. | Clip each daily line to `DREAM_LINE_MAX_CHARS` (600) at ingest, same cap the model already uses. |
| File size | Whole-file reject. | Fill current shard until the next line would exceed 64 KiB; then `YYYY-MM-DD.N.md`. Max 8 shards per local day. Further material waits on unmoved cursors. |
| Backlog | Every sweep re-reads from byte 0. | Cursors advance for consumed bytes. Catch-up repeats ingest+dream up to `BACKFILL_MAX_SWEEPS` per run. |

## Ingest

`applyGrokIngest` becomes budget-aware. It does not assume one daily string can hold every session.

### Clip

`formatDailyFile` / ingest writes clip `text` to `DREAM_LINE_MAX_CHARS`. Metadata (`agentId`, `sessionId`, `cwd`, `kind`) stays intact. Secrets and tool/subagent turns stay excluded.

### Fill until budget

Process session pages in `listSessions` order (existing). For each page:

1. Convert updates to daily lines (existing `grokTurnsFromUpdates` + `filterIngestTurns`).
2. Clip.
3. If the current shard plus the next line would exceed `MAX_FILE_BYTES` (64 KiB, UTF-8 byte length to match Rust `text.len()` — see note below), stop filling that shard.
4. If the day has fewer than `DAILY_MAX_SHARDS` (8), start `YYYY-MM-DD.(n+1).md` and continue.
5. If shards are exhausted, stop ingest. Remaining pages keep their old cursors.

Cursor rule: a session cursor advances to `page.nextByte` only when every row in that page was either dropped by the filter *or* written to a shard. If the page is cut mid-way, leave the cursor at the previous value so the next sweep retries that page. Duplicate daily lines from a retry are acceptable in P0 if `parseDailyFile` later sees the same `(agentId, sessionId, text)` — Deep scoring already treats frequency as a feature. P1 may add a seen-hash set on `MemoryState` (OpenClaw ingestion hashes) to skip exact retries; not required to unblock.

Note on byte vs char: Rust `write_capped` uses `text.len()` (UTF-8 bytes). TypeScript must budget with `new TextEncoder().encode(s).length`, not `s.length`.

### Independent persist

Ingest persistence is two calls, order required:

1. `writeMemoryHost({ dailyMd, dailyDay, stateJson })` for the shard currently being filled. If this throws 64 KiB, that is a bug in the filler — the filler must not produce an oversized string.
2. If a later shard write fails, still persist the latest `stateJson` (cursors + `lastError`) in a *state-only* patch so progress is not lost.

`refreshFromHost` already tries to persist ingest outside a sweep (`useDreamJob`). That path must use the same filler. Silent `.catch(() => undefined)` on ingest persist is allowed only after a state-only retry has been attempted.

### Paths

```
daily/YYYY-MM-DD.md      shard 1 (canonical, unchanged path)
daily/YYYY-MM-DD.2.md    shard 2
daily/YYYY-MM-DD.8.md    last allowed shard
```

`dailyMdPath(root, day)` keeps returning shard 1. New: `dailyShardPath(root, day, index)` with `index >= 1`, and `listDailyShards(root, day)` for readers. Host `write_at` already requires `is_ymd(day)` for `daily_day`; shards are extra files under `daily/`. Extend the host to accept `dailyShard: number` (default 1) or write shards from the frontend via `writeTextFile` only if the host stays ignorant — prefer extending `WritePatch` with optional `dailyShard` so the 64 KiB cap and path escape checks still apply.

Do not write `MEMORY.md`. Do not write outside `daily/`.

## Dreaming

Nightly / threshold / launch / manual still run `runDreamSweep` once per trigger, one `main` ACP prompt.

Input selection:

- Load shards for today and the previous `DREAM_LOOKBACK_DAYS` (7, matching OpenClaw REM lookback).
- `selectDreamInput` stays at 40 lines / 6000 chars / 600 chars per line.
- Prompt `<<<USER>>>` still requires `Source:` and “Stay within 8KiB”.

OpenClaw numbers we are *not* copying as extra ACP phases: Light `limit=100`, Deep `limit=10`, `maxPromotedSnippetTokens=160`. Our single prompt already has a tighter char budget than Light's 100 lines. Do not re-split the collapsed phase in this amendment.

Lock recovery already specified in working-tree `recoverStaleLock` (`LOCK_STALE_MS = 20 minutes`) stays. A recovered lock sets `lastStatus: failed` and `lastError: stale-lock`, then ingest may proceed.

Dream persist order:

1. State `lockOwner: dream`, `lastStatus: running` (state-only).
2. ACP `main`.
3. `userMd` / `dreamsMd` / state `ok` + `lastDeepAt`.
4. On ACP or validate failure: state-only `failed` + `lastError` + `lockOwner: null`. Do not blank `USER.md` or daily shards.

The 2026-09-08 failure wrote empty USER/DREAMS/daily because the catch path persisted the *pre-ingest* `io`. After this amendment the catch path must persist failed status onto the post-ingest `io` (shards and cursors kept).

## Catch-up / backfill

Not the default nightly path. Trigger when any of:

- Manual “立即整理” while `pendingMaterial` is above `thresholdSessions` after one sweep still left unmoved cursors or extra shards.
- Launch catch-up when `lastDeepAt` is null and pending sessions ≥ `thresholdSessions`.
- Settings action “消化积压” (P1 UI).

Behaviour, copied from OpenClaw `session-backfill` (oldest unprocessed first, drain bounded batches) and Hindsight (do not mark consumed on LLM failure):

1. Ingest until one shard fills or no remaining pages.
2. If that shard has new lines, run one dream sweep on the lookback+select window.
3. Repeat until (a) no pending pages, or (b) `BACKFILL_MAX_SWEEPS` (5) in this run, or (c) dream agent logged out, or (d) a sweep fails.

On (b) stop with `lastStatus: ok` if at least one sweep promoted or wrote a diary, else `failed`, and overlay `pending` with the remaining session count. Next launch/manual continues. Do not rewind cursors on a later failure.

Hindsight-style adaptive split (halve the LLM batch on failure) is **not** in P0. `selectDreamInput` already bounds the prompt. If a single `main` prompt still times out, record `lastError` and keep cursors; the next run retries the same selected window. P2 may drop `DREAM_INPUT_MAX_LINES` to 20 on timeout retry.

## Inject and MCP

Unchanged:

- First `session/prompt` of a new session prepends compact `USER.md` (4000 characters, section trim).
- `grok-build-memory` MCP stays the four-CLI sidecar. `memory_append` already refuses a line that would push the daily file over 64 KiB; after shards, append targets the last incomplete shard for today, or shard 1 if none exist. Same clip (2000 chars MCP max stays; if a line is longer, reject as today).

Do not add Mem0 MCP as a replacement.

## UI / copy

Overlay status gains one extra kind only if pending remains after a successful sweep that did not exhaust the backlog:

- Keep `pending` with session count (already exists).
- Failed copy must surface `lastError` when it is the 64 KiB string *or* `stale-lock`. Map 64 KiB to a stable i18n key: staging was truncated and will continue next run — after this amendment that error should be rare; if it still appears, it is a filler bug.

Do not show shard filenames in the growth page. Corpus line still counts today's lines across all of today's shards.

## Tests (acceptance)

Host / ingest (pure TS + existing Rust tests):

1. Clip: a 20 KiB utterance becomes 600 chars in the daily line.
2. Budget: 200 clipped lines that would exceed 64 KiB split across shard 1 and shard 2; each file `TextEncoder` size ≤ 65536.
3. Cursor: a page that does not fit leaves that session's cursor unchanged; a fully written page advances to `nextByte`.
4. State-only persist: a mocked oversized daily write still leaves `cursors` on disk (frontend unit with mocked `writeMemoryHost` call order).
5. Catch path: ACP throw does not write empty USER.md if USER.md was non-empty; cursors from ingest remain.
6. UTF-8: a line of 600 CJK characters is budgeted as bytes, not UTF-16 length.
7. `write_capped` still rejects >64 KiB (Rust, unchanged).
8. Path escape: `dailyShard` 0, negative, or >8 is rejected; `daily_day` still `YYYY-MM-DD` only.

Dream / gates:

9. Manual trigger still skips material gates.
10. Backfill loop stops at 5 sweeps even if pending remains; overlay pending > 0.
11. `selectDreamInput` over two shards still respects 40 / 6000.

i18n: ZH/EN keys stay in parity (`src/lib/i18n.test.ts`).

## Rollout

P0 — unblock dreaming on this machine.

- Budget-aware ingest, clip, independent state persist, shards, catch-path fix, stale-lock recovery (already in the dirty tree).
- One manual “立即整理” should produce a non-empty `daily/` shard and either a diary line or a *non-64-KiB* error.

P1 — catch-up UX.

- Backfill loop (5 sweeps) on launch when `lastDeepAt` is null and on “立即整理” when one sweep cannot drain pending.
- Overlay copy for remaining sessions. Optional Settings control “消化积压”.

P2 — follow-on, not this amendment.

- Seen-hash set to skip exact duplicate retries.
- sqlite for state (original spec).
- Per-row byte cursors so a single session can be consumed across two sweeps without retrying the whole page.
- Timeout retry with a smaller `selectDreamInput` window.

## Defaults

| Name | Value | Source |
|---|---|---|
| Daily shard cap | 64 KiB UTF-8 | existing `MAX_FILE_BYTES` |
| Max shards / local day | 8 | new |
| Line clip | 600 chars | existing `DREAM_LINE_MAX_CHARS` |
| Dream select | 40 lines / 6000 chars | existing |
| Lookback days | 7 | OpenClaw REM |
| USER.md | 8 KiB | existing spec |
| Inject | 4000 chars | existing |
| Backfill sweeps / run | 5 | new, below OpenClaw 92-day backfill |
| Stale lock | 20 min | existing working-tree `LOCK_STALE_MS` |

## Source of the copy

OpenClaw memory-core: daily vs MEMORY.md split; inject truncate; ingestion checkpoints; `session-backfill` bounded batches; Light/REM lookback+limit; Deep snippet cap and rewrite validators. Letta: overflow pages out of the hot window, does not fail the log. Hindsight: do not mark a batch consumed when the LLM fails. Graphiti/Zep: split *before* a hard API cap. Mem0: rejected as host; optional later MCP is out of scope.
