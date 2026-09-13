# Memory Dreaming Overflow Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Stop dream sweeps from dying on `file exceeds 64 KiB size limit` by clipping daily lines, filling 64 KiB shards, and persisting cursors even when staging is full.

**Architecture:** Keep the workbench Memory Host. Ingest writes clipped lines into `daily/YYYY-MM-DD.md` then `YYYY-MM-DD.N.md` until the day hits eight shards. Cursors and lock live in `.dreams/state.json` and are written in a separate host patch from `USER.md`. Dreaming still runs one ACP `main` prompt over `selectDreamInput` (40 / 6000). Catch-up repeats ingest+dream at most five times per run.

**Tech Stack:** TypeScript + Vitest, existing Tauri `write_memory_host` / `read_memory_host`. No new npm or cargo dependencies.

**Spec:** `docs/superpowers/specs/2026-09-08-memory-dreaming-overflow-design.md` (amends `docs/superpowers/specs/2026-08-30-user-memory-dreaming-design.md`).

## Global Constraints

- Do not vendor Mem0, Letta, Graphiti, Hindsight, or claude-mem.
- Do not map-reduce group summaries into `USER.md`.
- Do not raise `MAX_FILE_BYTES` (64 KiB) as the fix.
- Do not write `MEMORY.md`. Do not write outside `~/.acp-workbench/memory/`.
- UTF-8 byte length for the 64 KiB budget (`TextEncoder`), matching Rust `text.len()`.
- ZH/EN i18n keys stay in parity (`src/lib/i18n.test.ts`).
- TDD: failing test first. `npx vitest run <file>`; `cargo test --manifest-path src-tauri/Cargo.toml memory_host -- --nocapture` for Rust host changes.
- Leave dirty unrelated working-tree files alone. `git add` only files the task owns. Commit format: `<type>: <description>` with no attribution footer.
- CSS/UI: no new theme families. Overlay copy only.

## File map

| File | Responsibility |
|---|---|
| `src/lib/memory-paths.ts` | `dailyShardPath`, `dailyShardName`, shard index bounds |
| `src/lib/memory-ingest.ts` | Clip line text; UTF-8 byte length helper used by filler |
| `src/lib/memory-grok-turns.ts` | Budget-aware ingest: shards + partial cursors |
| `src/lib/memory-host-persist.ts` (new) | Ordered patches: state-only vs daily shard vs dream outputs |
| `src-tauri/src/memory_host.rs` | Optional `daily_shard` on `WritePatch` (1–8) |
| `src/hooks/useDreamJob.ts` | Use persist helpers; keep cursors on dream failure; P1 backfill loop |
| `src/lib/memory-view.ts` / `src/lib/i18n.ts` | Pending remainder copy if needed |
| Tests next to each file | Behavior in the spec “Tests (acceptance)” list |

Do not re-open Light/REM/Deep as three ACP prompts. Do not add sqlite.

---

### Task 1: Daily shard paths

**Files:**
- Modify: `src/lib/memory-paths.ts`
- Modify: `src/lib/memory-paths.test.ts`

**Interfaces:**
- Consumes: existing `dailyMdPath(root, day)` (shard 1)
- Produces:
  - `export const DAILY_MAX_SHARDS = 8`
  - `export function dailyShardPath(memoryRoot: string, day: string, index: number): string`
  - Shard 1 === `dailyMdPath`. Index `< 1` or `> DAILY_MAX_SHARDS` throws.

- [ ] **Step 1: Write the failing tests**

```ts
import { describe, expect, it } from "vitest";
import { dailyMdPath, dailyShardPath, DAILY_MAX_SHARDS } from "./memory-paths";

describe("dailyShardPath", () => {
  it("shard 1 is the canonical daily file", () => {
    expect(dailyShardPath("/tmp/memory", "2026-09-08", 1)).toBe(dailyMdPath("/tmp/memory", "2026-09-08"));
    expect(dailyShardPath("/tmp/memory", "2026-09-08", 2)).toBe("/tmp/memory/daily/2026-09-08.2.md");
  });

  it("rejects out-of-range shard index", () => {
    expect(() => dailyShardPath("/tmp/memory", "2026-09-08", 0)).toThrow();
    expect(() => dailyShardPath("/tmp/memory", "2026-09-08", DAILY_MAX_SHARDS + 1)).toThrow();
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx vitest run src/lib/memory-paths.test.ts`
Expected: FAIL on missing export.

- [ ] **Step 3: Implement**

```ts
export const DAILY_MAX_SHARDS = 8;

export function dailyShardPath(memoryRoot: string, day: string, index: number): string {
  if (!Number.isInteger(index) || index < 1 || index > DAILY_MAX_SHARDS) {
    throw new Error("invalid daily shard");
  }
  const root = memoryRoot.replace(/\/+$/, "");
  if (index === 1) return `${root}/daily/${day}.md`;
  return `${root}/daily/${day}.${index}.md`;
}
```

Keep `dailyMdPath` as a one-line wrapper around shard 1 or leave it as-is and make shard 1 match it.

- [ ] **Step 4: Re-run tests**

Run: `npx vitest run src/lib/memory-paths.test.ts`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add src/lib/memory-paths.ts src/lib/memory-paths.test.ts
git commit -m "feat: add bounded daily memory shard paths"
```

---

### Task 2: Clip daily lines and UTF-8 budget helper

**Files:**
- Modify: `src/lib/memory-ingest.ts`
- Modify: `src/lib/memory-ingest.test.ts`
- Modify: `src/lib/memory-weight.ts` only if the clip helper should live there — prefer ingest, import `DREAM_LINE_MAX_CHARS` from `memory-weight.ts`.

**Interfaces:**
- Consumes: `DREAM_LINE_MAX_CHARS` from `memory-weight.ts` (600)
- Produces:
  - `export function utf8Bytes(text: string): number`
  - `export function clipDailyText(text: string, maxChars?: number): string`
  - `formatDailyFile` clips each line's text before encode.

- [ ] **Step 1: Write the failing tests**

```ts
it("clips a long utterance to DREAM_LINE_MAX_CHARS", () => {
  const text = "x".repeat(20_000);
  const lines = [{ agentId: "grok" as const, sessionId: "s1", cwd: "/p", kind: "user_utterance" as const, text }];
  const file = formatDailyFile("2026-09-08", lines);
  expect(file).toContain("x".repeat(600));
  expect(file).not.toContain("x".repeat(601));
});

it("utf8Bytes counts CJK as three bytes each", () => {
  expect(utf8Bytes("中")).toBe(3);
});
```

- [ ] **Step 2: Run to verify fail**

Run: `npx vitest run src/lib/memory-ingest.test.ts`

- [ ] **Step 3: Implement**

```ts
import { DREAM_LINE_MAX_CHARS } from "./memory-weight";

export function utf8Bytes(text: string): number {
  return new TextEncoder().encode(text).length;
}

export function clipDailyText(text: string, maxChars = DREAM_LINE_MAX_CHARS): string {
  return text.length > maxChars ? text.slice(0, maxChars) : text;
}
```

In `formatDailyFile`, use `clipDailyText(l.text)` when building the body.

- [ ] **Step 4: Re-run tests** — PASS.

- [ ] **Step 5: Commit**

```bash
git add src/lib/memory-ingest.ts src/lib/memory-ingest.test.ts
git commit -m "feat: clip daily memory lines to the dream line budget"
```

---

### Task 3: Budget-aware ingest (shards + partial cursors)

**Files:**
- Modify: `src/lib/memory-grok-turns.ts`
- Modify: `src/lib/memory-grok-turns.test.ts`

**Interfaces:**
- Consumes: `applyGrokIngest` current signature; `formatDailyFile`, `parseDailyFile`, `utf8Bytes`, `DAILY_MAX_SHARDS`, `MAX_FILE_BYTES` — export a TS constant `export const MEMORY_FILE_MAX_BYTES = 64 * 1024` from a small shared module or duplicate the number next to tests; do not import Rust. Put `MEMORY_FILE_MAX_BYTES` in `memory-ingest.ts`.
- Produces: `applyGrokIngest` returns `{ io, newSessionCount, shards: Record<number, string>, stoppedEarly: boolean }` where `io.dailyMd` is shard 1 and `shards[n]` is shard n. Cursors advance only for fully consumed pages.

Extend `DreamIo` only if needed. Prefer keeping `io.dailyMd` as shard 1 and putting extra shards on the return value so `runDreamSweep` stays unaware. `useDreamJob` persist loop writes each shard.

- [ ] **Step 1: Failing tests** (add to `memory-grok-turns.test.ts`)

```ts
it("fills shard 1 then shard 2 before advancing a later session cursor", () => {
  // Build enough clipped user lines that shard 1 cannot hold both sessions.
  // Session A fully written → cursor A === nextByte.
  // Session B does not fit in remaining shard-1 space but fits in shard 2 → cursor B advances.
});

it("leaves a session cursor unchanged when all shards are full", () => {
  // Pre-fill io.dailyMd almost to 64 KiB; DAILY_MAX_SHARDS extra shards also full;
  // incoming page must not change cursors[key].
});
```

Use short `cwd` values so metadata does not dominate. Count with `utf8Bytes`.

- [ ] **Step 2: Run** `npx vitest run src/lib/memory-grok-turns.test.ts` — FAIL.

- [ ] **Step 3: Implement filler**

Keep `skipDreamIngestPage` and forgotten-id skips. Algorithm:

```
shards = { 1: existing daily or "# day\n" }
index = 1
for page in pages:
  if forgotten or skip: continue
  lines = filter(clip(turns(page)))
  if lines do not all fit starting at current shard, rolling to new shards up to max:
    if none of the page's lines were written: do not update cursor; stoppedEarly = true; break
    else: (P0) do not update cursor for partial page; stoppedEarly = true; break
  write all lines of this page into shards
  cursors[key] = page.nextByte
  if kept.length: newSessionCount++
io.dailyMd = shards[1]
return { io, newSessionCount, shards, stoppedEarly }
```

Fitting a line: `utf8Bytes(currentShardWithLine) <= MEMORY_FILE_MAX_BYTES`. Empty shard starts with `# ${day}\n`.

- [ ] **Step 4: Re-run tests** — PASS. Also `npx vitest run src/lib/memory-grok-turns.test.ts src/lib/memory-ingest.test.ts`.

- [ ] **Step 5: Commit**

```bash
git add src/lib/memory-grok-turns.ts src/lib/memory-grok-turns.test.ts src/lib/memory-ingest.ts
git commit -m "feat: shard daily ingest instead of failing the 64 KiB cap"
```

---

### Task 4: Host `dailyShard` patch

**Files:**
- Modify: `src-tauri/src/memory_host.rs`
- Modify: `src/api.ts` (`MemoryHostPatch`)

**Interfaces:**
- Consumes: existing `WritePatch { daily_md, daily_day, ... }`
- Produces: optional `daily_shard: Option<u32>` default 1. Path `daily/{day}.md` or `daily/{day}.{n}.md`. Reject shard 0 or >8. `is_ymd(day)` unchanged.

- [ ] **Step 1: Rust failing tests** in the existing `memory_host.rs` `#[cfg(test)]` module

```rust
#[test]
fn write_daily_shard_two_roundtrips() {
    let root = temp_root();
    write_at(
        &root,
        WritePatch {
            daily_md: Some("b".into()),
            daily_day: Some("2026-09-08".into()),
            daily_shard: Some(2),
            ..WritePatch::default()
        },
    )
    .unwrap();
    assert_eq!(
        std::fs::read_to_string(root.join("daily").join("2026-09-08.2.md")).unwrap(),
        "b"
    );
    cleanup(&root);
}

#[test]
fn write_rejects_shard_nine() {
    let root = temp_root();
    let err = write_at(
        &root,
        WritePatch {
            daily_md: Some("x".into()),
            daily_day: Some("2026-09-08".into()),
            daily_shard: Some(9),
            ..WritePatch::default()
        },
    )
    .unwrap_err();
    assert!(err.to_lowercase().contains("shard") || err.to_lowercase().contains("day"));
    cleanup(&root);
}
```

- [ ] **Step 2:** `cargo test --manifest-path src-tauri/Cargo.toml memory_host -- --nocapture` — FAIL.

- [ ] **Step 3: Implement** `daily_rel(day, shard)` → `daily/{day}.md` or `daily/{day}.{shard}.md`. `read_at` can keep reading shard 1 only; frontend reads extra shards via `readTextFile` like `localDaily` today.

- [ ] **Step 4: Tests PASS.** Update `MemoryHostPatch` in `src/api.ts` with optional `dailyShard?: number`.

- [ ] **Step 5: Commit**

```bash
git add src-tauri/src/memory_host.rs src/api.ts
git commit -m "feat: allow daily memory host writes to numbered shards"
```

---

### Task 5: Persist helpers and dream catch path

**Files:**
- Create: `src/lib/memory-host-persist.ts`
- Create: `src/lib/memory-host-persist.test.ts`
- Modify: `src/hooks/useDreamJob.ts`

**Interfaces:**
- Consumes: `writeMemoryHost` from `../api` (inject in tests)
- Produces:
  - `persistState(state)` → `{ stateJson }`
  - `persistDailyShards(day, shards)` → one patch per shard, then nothing else
  - `persistDreamFiles({ userMd, dreamsMd, state })`
  - On daily failure, retry `persistState`

`useDreamJob` ingest (both `refreshFromHost` and gather): write shards then state. Dream catch: set `lastStatus/lastError/lockOwner` on the *post-ingest* io; do not persist empty USER.md over a non-empty file.

- [ ] **Step 1: Failing tests** with a fake `writeMemoryHost` that rejects daily > 64 KiB and records calls.

```ts
it("writes stateJson after a rejected daily patch", async () => {
  const calls: unknown[] = [];
  const write = async (patch: MemoryHostPatch) => {
    calls.push(patch);
    if (patch.dailyMd && patch.dailyMd.length > 10) throw new Error("file exceeds 64 KiB size limit");
  };
  await persistIngest({ write, day: "2026-09-08", shards: { 1: "x".repeat(20) }, state: emptyMemoryState() });
  expect(calls.some((c) => c && typeof c === "object" && "stateJson" in c && !("dailyMd" in c && (c as MemoryHostPatch).dailyMd))).toBe(true);
});
```

Adjust to the helper you actually export. The invariant: last successful call includes `stateJson` and does not include an oversized `dailyMd`.

- [ ] **Step 2: FAIL, then implement helpers, then PASS.**

- [ ] **Step 3: Wire `useDreamJob`**

Replace `persistIo` usages:

- Ingest: `persistIngest({ day, shards, state })`.
- Lock running: `persistState`.
- Success: `persistDreamFiles` + `persistIngest` if shards changed.
- Catch: `persistState` on failed post-ingest state only.

Load extra shards in `ioFromHost` via `readTextFile(dailyShardPath(...))` for index 2..8, ignoring not-found. Pass them into `selectDreamInput` as additional `{ lines, day }` entries (same calendar day).

- [ ] **Step 4:** `npx vitest run src/lib/memory-host-persist.test.ts src/hooks/useDreamJob.ts` (and any existing `useDreamJob` tests if present). `npx tsc --noEmit` if the task touched hooks.

- [ ] **Step 5: Commit**

```bash
git add src/lib/memory-host-persist.ts src/lib/memory-host-persist.test.ts src/hooks/useDreamJob.ts
git commit -m "fix: persist memory cursors independently of daily size"
```

---

### Task 6: Lookback shards in dream input

**Files:**
- Modify: `src/hooks/useDreamJob.ts` (runPhase gather/main)
- Modify: `src/lib/memory-weight.test.ts` only if a helper is extracted
- Optional new: `src/lib/memory-daily-read.ts` `loadLookbackDays(root, today, lookbackDays) → { lines, day }[]`

**Interfaces:**
- `DREAM_LOOKBACK_DAYS = 7`
- Gather merges ingest into today's shards; main calls `selectDreamInput(lookback, today)`.

- [ ] Tests: two days of lines, today selected first via recencyFactor (already in `weightDailyLines`). One test that shard 2 of yesterday is included in the days array.

- [ ] Commit: `feat: feed dream selection from seven days of daily shards`

---

### Task 7: P1 backfill loop

**Files:**
- Modify: `src/hooks/useDreamJob.ts`
- Modify: `src/lib/memory-gates.ts` only if a new trigger `"backfill"` is cleaner — prefer staying on `"manual"` / `"launch"` and looping `runSweep` internally.
- Modify: `src/lib/i18n.ts` + `src/lib/i18n.test.ts` if overlay copy changes
- Modify: growth page / MemoryDreamPane only if a “消化积压” button is in scope. Spec P1 allows overlay pending count without a new button: looping on manual + launch is enough.

**Interfaces:**
- `BACKFILL_MAX_SWEEPS = 5`
- After a successful sweep, if ingest `stoppedEarly` or pending pages remain, and trigger is `manual` or `launch` with `lastDeepAt === null`, call `runSweep` again up to 5 times. Stop on `blocked-login` or `failed`.

- [ ] Test the loop in a extracted pure function:

```ts
export function nextBackfillAction(input: {
  sweepsDone: number;
  stoppedEarly: boolean;
  pending: number;
  lastReason?: string;
}): "again" | "stop" {
  if (input.sweepsDone >= 5) return "stop";
  if (input.lastReason === "blocked-login" || input.lastReason === "failed") return "stop";
  if (input.stoppedEarly || input.pending > 0) return "again";
  return "stop";
}
```

Put it in `src/lib/memory-gates.ts` or `src/lib/memory-backfill.ts`.

- [ ] Commit: `feat: drain memory backlog in bounded dream sweeps`

---

### Task 8: Verification on the live host

Not a code task. After P0 is on a build the operator actually runs:

1. Confirm `~/.acp-workbench/memory/.dreams/state.json` no longer shows `file exceeds 64 KiB size limit` after one manual dream, *or* shows a different error (login / ACP timeout).
2. `cursors` is non-empty.
3. At least one `daily/2026-09-08.md` (or later day) has size `> 0` and `≤ 65536`.
4. `USER.md` / `DREAMS.md` are not both blanked if they had content (on this machine they start empty; non-empty is success).
5. Run `npx vitest run src/lib/memory-paths.test.ts src/lib/memory-ingest.test.ts src/lib/memory-grok-turns.test.ts src/lib/memory-host-persist.test.ts src/lib/memory-gates.test.ts src/lib/i18n.test.ts` and `cargo test --manifest-path src-tauri/Cargo.toml memory_host`.

Do not claim the feature shipped from unit tests alone.

---

## Spec coverage

| Spec rule | Task |
|---|---|
| Clip 600 | 2 |
| 64 KiB shards, max 8 | 1, 3, 4 |
| Cursor only if page fully written | 3 |
| State persist independent | 5 |
| Catch path keeps ingest | 5 |
| UTF-8 budget | 2, 3 |
| Host shard path / reject 9 | 4 |
| Lookback 7 days | 6 |
| Backfill 5 sweeps | 7 |
| Live 64 KiB error gone | 8 |
| No Mem0 / no map-reduce / no cap raise | Global constraints |

## Execution

Plan saved to `docs/superpowers/plans/2026-09-08-memory-dreaming-overflow.md`. Spec saved to `docs/superpowers/specs/2026-09-08-memory-dreaming-overflow-design.md`.
