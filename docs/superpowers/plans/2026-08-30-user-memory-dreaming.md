# User Memory and Daily Dreaming Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Ship a workbench-owned Memory Host: fuse agent transcripts into one `USER.md`, run a daily dream on a user-chosen CLI, and prepend a compact profile on the first prompt of every new session.

**Architecture:** Spec is `docs/superpowers/specs/2026-08-30-user-memory-dreaming-design.md`. All ranking, gates, inject, ingest filters, and overlay view models are pure TypeScript. Disk lives under `~/.acp-workbench/memory/` behind a small Rust module. DreamJob talks to ACP only through an injected `runPhase(prompt)` so unit tests never spawn an agent.

**Tech Stack:** TypeScript + Vitest (`npm test`), existing Tauri invoke + ACP `session/new` / `session/prompt`. No new npm or cargo dependencies. P0 state is `.dreams/state.json` (same records as the spec’s sqlite contract).

## Global Constraints

- Spec path: `docs/superpowers/specs/2026-08-30-user-memory-dreaming-design.md`. Locked decisions in that file win.
- `AgentId` is `"grok" | "kimi" | "claude" | "codex"`. Import from `src/lib/agent-id.ts`. Do not redefine.
- One `USER.md`. Do not write `~/.grok/memory/**/MEMORY.md` or any other CLI memory tree.
- Do not vendor OpenClaw, Letta, Mem0, Graphiti, Hindsight, or claude-mem.
- Do not add rusqlite, sql.js, or a graph database. Persist MemoryState as JSON.
- Do not send a hidden `session/prompt` after `session/new`. Inject only by wrapping the first real prompt.
- Do not silently change `dreamAgentId` when that CLI is logged out.
- Do not write real user home files in tests. Use strings and temp dirs only.
- Leave dirty working-tree files alone unless this task’s Files list includes them. `git add` only files this task owns. Never `git add -A`.
- Tests: `npm test -- src/lib/<file>.test.ts` for TS; `cargo test --manifest-path src-tauri/Cargo.toml memory_host -- --nocapture` for Rust. TDD: failing test first.
- ZH/EN i18n keys must stay in parity (`src/lib/i18n.test.ts`).

## File map

| File | Responsibility |
|---|---|
| `src/lib/workbench-home.ts` | `workbenchMemoryRoot(wbHome)` |
| `src/lib/memory-paths.ts` | `USER.md` / `DREAMS.md` / daily / state.json paths |
| `src/lib/memory-settings.ts` | Parse inject / dreaming / `dreamAgentId` |
| `src/lib/memory-gates.ts` | Five dream gates + manual skips |
| `src/lib/memory-clock.ts` | Cursor key + local day stamp |
| `src/lib/memory-inject.ts` | Compact trim + first-prompt wrap |
| `src/lib/memory-validate.ts` | `USER.md` rewrite validators + rollback |
| `src/lib/memory-ingest.ts` | Turn filter, secret redact, daily encode |
| `src/lib/memory-score.ts` | Fusion score + contradiction keep |
| `src/lib/memory-state.ts` | MemoryState JSON shape |
| `src/lib/memory-dream.ts` | Phase orchestration (injected runner) |
| `src/lib/memory-schedule.ts` | 03:00 + launch catch-up |
| `src/lib/memory-view.ts` | Overlay status / diary / timeline |
| `src-tauri/src/memory_host.rs` | Read/write memory root |
| `src/components/MemoryDreamPane.tsx` | Left diary + right timeline |
| `src/components/MemoryInjectChip.tsx` | “已加载记忆” |
| `src/components/MemoryWorkspace.tsx` | Compose dream pane + collapsed project files |
| Modify settings / persist / slash / `sendPrompt` | Chrome + inject wire |

## Follow-on (do not execute in this file)

- Kimi / Claude / Codex `AdminPort.read_session_updates` ingest
- Heatmap, intimacy, write-back to native `MEMORY.md`
- Swap `state.json` for sqlite

---

### Task 1: Memory paths

**Files:**
- Modify: `src/lib/workbench-home.ts`
- Modify: `src/lib/workbench-home.test.ts`
- Create: `src/lib/memory-paths.ts`
- Create: `src/lib/memory-paths.test.ts`

**Interfaces:**
- Consumes: `workbenchJsonPath` style from `workbench-home.ts`
- Produces:
  - `export function workbenchMemoryRoot(wbHome: string): string`
  - `export function userMdPath(memoryRoot: string): string`
  - `export function dreamsMdPath(memoryRoot: string): string`
  - `export function dailyMdPath(memoryRoot: string, day: string): string`
  - `export function memoryStatePath(memoryRoot: string): string`

- [ ] **Step 1: Write the failing tests**

```ts
import { describe, expect, it } from "vitest";
import { workbenchMemoryRoot } from "./workbench-home";
import { dailyMdPath, dreamsMdPath, memoryStatePath, userMdPath } from "./memory-paths";

describe("workbenchMemoryRoot", () => {
  it("nests memory under the workbench home", () => {
    expect(workbenchMemoryRoot("/Users/me/.acp-workbench/")).toBe("/Users/me/.acp-workbench/memory");
  });
});

describe("memory-paths", () => {
  it("uses the locked filenames", () => {
    const root = "/tmp/memory";
    expect(userMdPath(root)).toBe("/tmp/memory/USER.md");
    expect(dreamsMdPath(root)).toBe("/tmp/memory/DREAMS.md");
    expect(dailyMdPath(root, "2026-08-30")).toBe("/tmp/memory/daily/2026-08-30.md");
    expect(memoryStatePath(root)).toBe("/tmp/memory/.dreams/state.json");
  });
});
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `npm test -- src/lib/workbench-home.test.ts src/lib/memory-paths.test.ts`

Expected: FAIL (`workbenchMemoryRoot` / `memory-paths` not exported)

- [ ] **Step 3: Implement**

```ts
// workbench-home.ts
export function workbenchMemoryRoot(wbHome: string): string {
  return `${wbHome.replace(/\/+$/, "")}/memory`;
}

// memory-paths.ts
export function userMdPath(memoryRoot: string): string {
  return `${memoryRoot.replace(/\/+$/, "")}/USER.md`;
}
export function dreamsMdPath(memoryRoot: string): string {
  return `${memoryRoot.replace(/\/+$/, "")}/DREAMS.md`;
}
export function dailyMdPath(memoryRoot: string, day: string): string {
  return `${memoryRoot.replace(/\/+$/, "")}/daily/${day}.md`;
}
export function memoryStatePath(memoryRoot: string): string {
  return `${memoryRoot.replace(/\/+$/, "")}/.dreams/state.json`;
}
```

- [ ] **Step 4: Run tests to verify they pass**

Run: `npm test -- src/lib/workbench-home.test.ts src/lib/memory-paths.test.ts`

Expected: PASS

- [ ] **Step 5: Commit**

```bash
git add src/lib/workbench-home.ts src/lib/workbench-home.test.ts src/lib/memory-paths.ts src/lib/memory-paths.test.ts
git commit -m "feat: add workbench memory file paths"
```

---

### Task 2: Memory settings

**Files:**
- Create: `src/lib/memory-settings.ts`
- Create: `src/lib/memory-settings.test.ts`

**Interfaces:**
- Consumes: `AgentId`, `isAgentId` from `./agent-id`
- Produces:
  - `export type MemorySettings = { injectUserMemory: boolean; dreamingEnabled: boolean; dreamAgentId: AgentId }`
  - `export const DEFAULT_MEMORY_SETTINGS: MemorySettings`
  - `export function parseMemorySettings(raw: unknown): MemorySettings`
  - `export function canSaveDreamAgent(id: string, loggedIn: readonly AgentId[]): id is AgentId`

Defaults: `injectUserMemory: true`, `dreamingEnabled: true`, `dreamAgentId: "grok"`. Unknown / logged-out `dreamAgentId` falls back to `"grok"` on parse. `canSaveDreamAgent` is what Settings uses to reject a save.

- [ ] **Step 1: Write the failing test**

```ts
import { describe, expect, it } from "vitest";
import { canSaveDreamAgent, parseMemorySettings } from "./memory-settings";

describe("parseMemorySettings", () => {
  it("defaults to inject on, dreaming on, grok", () => {
    expect(parseMemorySettings(undefined)).toEqual({
      injectUserMemory: true,
      dreamingEnabled: true,
      dreamAgentId: "grok",
    });
  });

  it("keeps a logged-in claude runner", () => {
    expect(parseMemorySettings({ injectUserMemory: false, dreamingEnabled: false, dreamAgentId: "claude" })).toEqual({
      injectUserMemory: false,
      dreamingEnabled: false,
      dreamAgentId: "claude",
    });
  });

  it("rejects an unknown agent id", () => {
    expect(parseMemorySettings({ dreamAgentId: "other" }).dreamAgentId).toBe("grok");
  });
});

describe("canSaveDreamAgent", () => {
  it("allows only logged-in agents", () => {
    expect(canSaveDreamAgent("kimi", ["kimi", "grok"])).toBe(true);
    expect(canSaveDreamAgent("claude", ["grok"])).toBe(false);
    expect(canSaveDreamAgent("nope", ["grok"])).toBe(false);
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npm test -- src/lib/memory-settings.test.ts`

Expected: FAIL (module not found)

- [ ] **Step 3: Implement**

```ts
import { isAgentId, type AgentId } from "./agent-id";

export type MemorySettings = {
  injectUserMemory: boolean;
  dreamingEnabled: boolean;
  dreamAgentId: AgentId;
};

export const DEFAULT_MEMORY_SETTINGS: MemorySettings = {
  injectUserMemory: true,
  dreamingEnabled: true,
  dreamAgentId: "grok",
};

export function parseMemorySettings(raw: unknown): MemorySettings {
  const row = raw && typeof raw === "object" ? (raw as Record<string, unknown>) : {};
  const id = typeof row.dreamAgentId === "string" && isAgentId(row.dreamAgentId) ? row.dreamAgentId : "grok";
  return {
    injectUserMemory: row.injectUserMemory !== false,
    dreamingEnabled: row.dreamingEnabled !== false,
    dreamAgentId: id,
  };
}

export function canSaveDreamAgent(id: string, loggedIn: readonly AgentId[]): id is AgentId {
  return isAgentId(id) && loggedIn.includes(id);
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npm test -- src/lib/memory-settings.test.ts`

Expected: PASS

- [ ] **Step 5: Commit**

```bash
git add src/lib/memory-settings.ts src/lib/memory-settings.test.ts
git commit -m "feat: parse user-memory inject and dream-agent settings"
```

---

### Task 3: Dream gates

**Files:**
- Create: `src/lib/memory-gates.ts`
- Create: `src/lib/memory-gates.test.ts`

**Interfaces:**
- Consumes: nothing from later tasks
- Produces:
  - `export type DreamTrigger = "schedule" | "launch" | "manual"`
  - `export type DreamGateInput = { enabled: boolean; now: number; lastDeepAt: number | null; lastScanAt: number | null; newSessionCount: number; lockHeld: boolean; trigger: DreamTrigger }`
  - `export type DreamGateResult = { ok: true } | { ok: false; reason: "disabled" | "too-soon" | "scan-throttle" | "no-sessions" | "locked" }`
  - `export function evaluateDreamGates(input: DreamGateInput): DreamGateResult`

Constants: `DEEP_MIN_MS = 20 * 60 * 60 * 1000`, `SCAN_MIN_MS = 10 * 60 * 1000`. Manual skips `too-soon` and `no-sessions`. Still honors enabled + lock + scan throttle.

- [ ] **Step 1: Write the failing test**

```ts
import { describe, expect, it } from "vitest";
import { evaluateDreamGates } from "./memory-gates";

const base = {
  enabled: true,
  now: 1_000_000,
  lastDeepAt: null as number | null,
  lastScanAt: null as number | null,
  newSessionCount: 1,
  lockHeld: false,
  trigger: "schedule" as const,
};

describe("evaluateDreamGates", () => {
  it("passes a first scheduled run", () => {
    expect(evaluateDreamGates(base)).toEqual({ ok: true });
  });

  it("blocks when disabled, locked, or empty", () => {
    expect(evaluateDreamGates({ ...base, enabled: false })).toEqual({ ok: false, reason: "disabled" });
    expect(evaluateDreamGates({ ...base, lockHeld: true })).toEqual({ ok: false, reason: "locked" });
    expect(evaluateDreamGates({ ...base, newSessionCount: 0 })).toEqual({ ok: false, reason: "no-sessions" });
  });

  it("enforces 20h and 10min on schedule", () => {
    expect(evaluateDreamGates({ ...base, lastDeepAt: 1_000_000 - 19 * 60 * 60 * 1000 })).toEqual({
      ok: false,
      reason: "too-soon",
    });
    expect(evaluateDreamGates({ ...base, lastScanAt: 1_000_000 - 5 * 60 * 1000 })).toEqual({
      ok: false,
      reason: "scan-throttle",
    });
  });

  it("lets manual skip 20h and session count", () => {
    expect(evaluateDreamGates({ ...base, trigger: "manual", newSessionCount: 0, lastDeepAt: 999_000 })).toEqual({
      ok: true,
    });
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npm test -- src/lib/memory-gates.test.ts`

Expected: FAIL

- [ ] **Step 3: Implement**

```ts
export type DreamTrigger = "schedule" | "launch" | "manual";

export type DreamGateInput = {
  enabled: boolean;
  now: number;
  lastDeepAt: number | null;
  lastScanAt: number | null;
  newSessionCount: number;
  lockHeld: boolean;
  trigger: DreamTrigger;
};

export type DreamGateResult =
  | { ok: true }
  | { ok: false; reason: "disabled" | "too-soon" | "scan-throttle" | "no-sessions" | "locked" };

export const DEEP_MIN_MS = 20 * 60 * 60 * 1000;
export const SCAN_MIN_MS = 10 * 60 * 1000;

export function evaluateDreamGates(input: DreamGateInput): DreamGateResult {
  if (!input.enabled) return { ok: false, reason: "disabled" };
  if (input.lockHeld) return { ok: false, reason: "locked" };
  if (input.lastScanAt != null && input.now - input.lastScanAt < SCAN_MIN_MS) {
    return { ok: false, reason: "scan-throttle" };
  }
  const manual = input.trigger === "manual";
  if (!manual && input.lastDeepAt != null && input.now - input.lastDeepAt < DEEP_MIN_MS) {
    return { ok: false, reason: "too-soon" };
  }
  if (!manual && input.newSessionCount < 1) return { ok: false, reason: "no-sessions" };
  return { ok: true };
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npm test -- src/lib/memory-gates.test.ts`

Expected: PASS

- [ ] **Step 5: Commit**

```bash
git add src/lib/memory-gates.ts src/lib/memory-gates.test.ts
git commit -m "feat: add daily dream start gates"
```

---

### Task 4: Cursor key and local day

**Files:**
- Create: `src/lib/memory-clock.ts`
- Create: `src/lib/memory-clock.test.ts`

**Interfaces:**
- Consumes: `AgentId`, `sessionRefKey` from `./agent-id`
- Produces:
  - `export function memoryCursorKey(agentId: AgentId, sessionId: string): string` — same as `sessionRefKey`
  - `export function localDayStamp(ms: number, timeZone: string): string` — `YYYY-MM-DD` in that zone

- [ ] **Step 1: Write the failing test**

```ts
import { describe, expect, it } from "vitest";
import { localDayStamp, memoryCursorKey } from "./memory-clock";

describe("memoryCursorKey", () => {
  it("brands the session id", () => {
    expect(memoryCursorKey("grok", "abc")).toBe("grok/abc");
  });
});

describe("localDayStamp", () => {
  it("buckets by the given timezone", () => {
    expect(localDayStamp(Date.parse("2026-08-30T16:00:00Z"), "UTC")).toBe("2026-08-30");
    expect(localDayStamp(Date.parse("2026-08-30T16:00:00Z"), "America/Los_Angeles")).toBe("2026-08-30");
    expect(localDayStamp(Date.parse("2026-08-31T02:00:00Z"), "America/Los_Angeles")).toBe("2026-08-30");
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npm test -- src/lib/memory-clock.test.ts`

Expected: FAIL

- [ ] **Step 3: Implement**

```ts
import { sessionRefKey, type AgentId } from "./agent-id";

export function memoryCursorKey(agentId: AgentId, sessionId: string): string {
  return sessionRefKey({ agentId, sessionId });
}

export function localDayStamp(ms: number, timeZone: string): string {
  const parts = new Intl.DateTimeFormat("en-CA", {
    timeZone,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).formatToParts(new Date(ms));
  const year = parts.find((p) => p.type === "year")?.value;
  const month = parts.find((p) => p.type === "month")?.value;
  const day = parts.find((p) => p.type === "day")?.value;
  return `${year}-${month}-${day}`;
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npm test -- src/lib/memory-clock.test.ts`

Expected: PASS

- [ ] **Step 5: Commit**

```bash
git add src/lib/memory-clock.ts src/lib/memory-clock.test.ts
git commit -m "feat: stamp memory cursors and local dream days"
```

---

### Task 5: Compact USER.md and first-prompt wrap

**Files:**
- Create: `src/lib/memory-inject.ts`
- Create: `src/lib/memory-inject.test.ts`

**Interfaces:**
- Consumes: nothing
- Produces:
  - `export const USER_MD_COMPACT_LIMIT = 4000`
  - `export function compactUserMd(text: string, limit?: number): string`
  - `export type WrapFirstPromptInput = { sessionId: string; alreadyInjected: boolean; injectOn: boolean; userMd: string | null; userText: string }`
  - `export type WrapFirstPromptResult = { text: string; injected: boolean }`
  - `export function wrapFirstPrompt(input: WrapFirstPromptInput): WrapFirstPromptResult`

Compact: trim from the top by markdown heading / blank-line sections so a cut never lands mid-sentence when a section boundary exists. Wrap prepends:

```
<user-memory>
...compact...
</user-memory>

```

then the user text. `injected` is true only when a non-empty compact block was added. Failures (empty, inject off, already injected) return the original `userText`.

- [ ] **Step 1: Write the failing test**

```ts
import { describe, expect, it } from "vitest";
import { compactUserMd, wrapFirstPrompt } from "./memory-inject";

describe("compactUserMd", () => {
  it("keeps short files", () => {
    expect(compactUserMd("# You\n- likes tests\n")).toBe("# You\n- likes tests\n");
  });

  it("cuts on a heading before the limit", () => {
    const a = `# A\n${"x".repeat(80)}\n\n`;
    const b = `# B\n${"y".repeat(80)}\n`;
    const out = compactUserMd(a + b, 120);
    expect(out.startsWith("# A")).toBe(true);
    expect(out.includes("# B")).toBe(false);
    expect(out.length).toBeLessThanOrEqual(120);
  });
});

describe("wrapFirstPrompt", () => {
  const md = "# You\n- prefers TypeScript\n";
  it("prepends once when inject is on", () => {
    const r = wrapFirstPrompt({
      sessionId: "s1",
      alreadyInjected: false,
      injectOn: true,
      userMd: md,
      userText: "hello",
    });
    expect(r.injected).toBe(true);
    expect(r.text.endsWith("hello")).toBe(true);
    expect(r.text.includes("prefers TypeScript")).toBe(true);
  });

  it("sends the original text when off, empty, or already injected", () => {
    expect(wrapFirstPrompt({ sessionId: "s1", alreadyInjected: true, injectOn: true, userMd: md, userText: "hello" })).toEqual({
      text: "hello",
      injected: false,
    });
    expect(wrapFirstPrompt({ sessionId: "s1", alreadyInjected: false, injectOn: false, userMd: md, userText: "hello" }).injected).toBe(false);
    expect(wrapFirstPrompt({ sessionId: "s1", alreadyInjected: false, injectOn: true, userMd: "   ", userText: "hello" })).toEqual({
      text: "hello",
      injected: false,
    });
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npm test -- src/lib/memory-inject.test.ts`

Expected: FAIL

- [ ] **Step 3: Implement**

```ts
export const USER_MD_COMPACT_LIMIT = 4000;

export function compactUserMd(text: string, limit = USER_MD_COMPACT_LIMIT): string {
  const src = text.replace(/\s+$/u, "") + (text.endsWith("\n") ? "\n" : "");
  if (src.length <= limit) return text;
  const parts = src.split(/\n(?=# )/u);
  let out = "";
  for (const part of parts) {
    const next = out ? `${out}\n${part}` : part;
    if (next.length > limit) break;
    out = next;
  }
  if (!out) out = src.slice(0, limit);
  return out;
}

export type WrapFirstPromptInput = {
  sessionId: string;
  alreadyInjected: boolean;
  injectOn: boolean;
  userMd: string | null;
  userText: string;
};

export type WrapFirstPromptResult = { text: string; injected: boolean };

export function wrapFirstPrompt(input: WrapFirstPromptInput): WrapFirstPromptResult {
  if (input.alreadyInjected || !input.injectOn) return { text: input.userText, injected: false };
  const compact = compactUserMd((input.userMd ?? "").trim());
  if (!compact) return { text: input.userText, injected: false };
  return { text: `<user-memory>\n${compact}\n</user-memory>\n\n${input.userText}`, injected: true };
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npm test -- src/lib/memory-inject.test.ts`

Expected: PASS

- [ ] **Step 5: Commit**

```bash
git add src/lib/memory-inject.ts src/lib/memory-inject.test.ts
git commit -m "feat: wrap the first prompt with compact USER.md"
```

---

### Task 6: USER.md rewrite validators

**Files:**
- Create: `src/lib/memory-validate.ts`
- Create: `src/lib/memory-validate.test.ts`

**Interfaces:**
- Consumes: nothing
- Produces:
  - `export const USER_MD_MAX_BYTES = 8 * 1024`
  - `export const USER_MD_MAX_LOSS = 0.2`
  - `export function parseUserMdEntries(text: string): string[]` — heading-aware bullet lines (`- `)
  - `export function validateUserMdRewrite(prev: string, next: string): { ok: true } | { ok: false; reason: "loss" | "source" | "budget" | "shape" }`
  - `export function applyUserMdRewrite(prev: string, next: string): { file: string; preimage: string } | { file: string; preimage: string; rejected: true }`

New promoted lines (in `next` but not `prev`) must contain `Source:`. Empty `prev` skips the loss check. Shape: at least one `# ` heading and one `- ` entry.

- [ ] **Step 1: Write the failing test**

```ts
import { describe, expect, it } from "vitest";
import { applyUserMdRewrite, parseUserMdEntries, validateUserMdRewrite } from "./memory-validate";

const prev = `# You
- likes tests
- hates fluff
`;

describe("parseUserMdEntries", () => {
  it("reads bullets", () => {
    expect(parseUserMdEntries(prev)).toEqual(["likes tests", "hates fluff"]);
  });
});

describe("validateUserMdRewrite", () => {
  it("accepts a sourced addition", () => {
    const next = `${prev}- prefers dark mode Source: grok · s1\n`;
    expect(validateUserMdRewrite(prev, next)).toEqual({ ok: true });
  });

  it("rejects loss, missing source, oversize, and shapeless files", () => {
    expect(validateUserMdRewrite(prev, "# You\n- likes tests Source: x\n").ok).toBe(false);
    expect(validateUserMdRewrite(prev, `${prev}- new fact\n`).reason).toBe("source");
    expect(validateUserMdRewrite("", "no heading").reason).toBe("shape");
    expect(validateUserMdRewrite("", `# You\n- ${"x".repeat(9000)} Source: a\n`).reason).toBe("budget");
  });
});

describe("applyUserMdRewrite", () => {
  it("rolls back to prev when invalid", () => {
    const r = applyUserMdRewrite(prev, "# You\n");
    expect(r.file).toBe(prev);
    expect(r.preimage).toBe(prev);
    expect("rejected" in r && r.rejected).toBe(true);
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npm test -- src/lib/memory-validate.test.ts`

Expected: FAIL

- [ ] **Step 3: Implement**

```ts
export const USER_MD_MAX_BYTES = 8 * 1024;
export const USER_MD_MAX_LOSS = 0.2;

export function parseUserMdEntries(text: string): string[] {
  return text
    .split(/\r?\n/)
    .map((line) => line.trim())
    .filter((line) => line.startsWith("- "))
    .map((line) => line.slice(2).trim());
}

export function validateUserMdRewrite(
  prev: string,
  next: string,
): { ok: true } | { ok: false; reason: "loss" | "source" | "budget" | "shape" } {
  if (new TextEncoder().encode(next).length > USER_MD_MAX_BYTES) return { ok: false, reason: "budget" };
  if (!/^# /m.test(next) || !/^- /m.test(next)) return { ok: false, reason: "shape" };
  const before = parseUserMdEntries(prev);
  const after = parseUserMdEntries(next);
  if (before.length > 0) {
    const kept = before.filter((e) => after.some((a) => a.includes(e) || e.includes(a))).length;
    if (kept / before.length < 1 - USER_MD_MAX_LOSS) return { ok: false, reason: "loss" };
  }
  const prevSet = new Set(before);
  for (const line of after) {
    if (prevSet.has(line)) continue;
    if (!/Source:\s*\S/.test(line)) return { ok: false, reason: "source" };
  }
  return { ok: true };
}

export function applyUserMdRewrite(
  prev: string,
  next: string,
): { file: string; preimage: string; rejected?: true } {
  const check = validateUserMdRewrite(prev, next);
  if (!check.ok) return { file: prev, preimage: prev, rejected: true };
  return { file: next, preimage: prev };
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npm test -- src/lib/memory-validate.test.ts`

Expected: PASS

- [ ] **Step 5: Commit**

```bash
git add src/lib/memory-validate.ts src/lib/memory-validate.test.ts
git commit -m "feat: validate USER.md dream rewrites before commit"
```

---

### Task 7: Ingest filter and daily file

**Files:**
- Create: `src/lib/memory-ingest.ts`
- Create: `src/lib/memory-ingest.test.ts`

**Interfaces:**
- Consumes: `AgentId` from `./agent-id`
- Produces:
  - `export type IngestKind = "user_pref" | "user_utterance" | "agent_commitment"`
  - `export type IngestTurn = { agentId: AgentId; sessionId: string; cwd: string; role: "user" | "assistant" | "tool" | "subagent"; text: string; kind?: IngestKind }`
  - `export type DailyLine = { agentId: AgentId; sessionId: string; cwd: string; kind: IngestKind; text: string }`
  - `export function looksLikeSecret(text: string): boolean`
  - `export function filterIngestTurns(turns: IngestTurn[], forgotten: readonly string[]): DailyLine[]`
  - `export function formatDailyFile(day: string, lines: DailyLine[]): string`
  - `export function parseDailyFile(text: string): DailyLine[]`

Skip: `role === "tool" | "subagent"`, forgotten `sessionId`, secret-shaped text. Keep user lines as `user_utterance` (or `user_pref` if `kind` set). Keep assistant lines only when `kind === "agent_commitment"`.

Secret heuristic: `sk-` / `ghp_` / `-----BEGIN` / `AKIA` / `xai-` prefixes, or `api[_-]?key\s*[:=]`.

Daily format (one line per turn, stable for tests):

```
# 2026-08-30
- [grok | s1 | /proj | user_utterance] hello
```

- [ ] **Step 1: Write the failing test**

```ts
import { describe, expect, it } from "vitest";
import { filterIngestTurns, formatDailyFile, looksLikeSecret, parseDailyFile } from "./memory-ingest";

describe("looksLikeSecret", () => {
  it("flags key-shaped strings", () => {
    expect(looksLikeSecret("sk-abc")).toBe(true);
    expect(looksLikeSecret("hello")).toBe(false);
  });
});

describe("filterIngestTurns", () => {
  it("keeps user talk and commitments, drops tools and forgotten", () => {
    const lines = filterIngestTurns(
      [
        { agentId: "grok", sessionId: "s1", cwd: "/p", role: "user", text: "use vitest" },
        { agentId: "claude", sessionId: "s2", cwd: "/p", role: "assistant", text: "I will use vitest", kind: "agent_commitment" },
        { agentId: "grok", sessionId: "s1", cwd: "/p", role: "tool", text: "ls" },
        { agentId: "grok", sessionId: "gone", cwd: "/p", role: "user", text: "old" },
        { agentId: "grok", sessionId: "s1", cwd: "/p", role: "user", text: "sk-secret" },
      ],
      ["gone"],
    );
    expect(lines.map((l) => l.text)).toEqual(["use vitest", "I will use vitest"]);
    expect(lines[1]?.agentId).toBe("claude");
  });
});

describe("daily file", () => {
  it("round-trips tagged lines", () => {
    const lines = filterIngestTurns(
      [{ agentId: "grok", sessionId: "s1", cwd: "/p", role: "user", text: "use vitest" }],
      [],
    );
    const text = formatDailyFile("2026-08-30", lines);
    expect(parseDailyFile(text)).toEqual(lines);
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npm test -- src/lib/memory-ingest.test.ts`

Expected: FAIL

- [ ] **Step 3: Implement**

```ts
import type { AgentId } from "./agent-id";
import { isAgentId } from "./agent-id";

export type IngestKind = "user_pref" | "user_utterance" | "agent_commitment";
export type IngestTurn = {
  agentId: AgentId;
  sessionId: string;
  cwd: string;
  role: "user" | "assistant" | "tool" | "subagent";
  text: string;
  kind?: IngestKind;
};
export type DailyLine = {
  agentId: AgentId;
  sessionId: string;
  cwd: string;
  kind: IngestKind;
  text: string;
};

export function looksLikeSecret(text: string): boolean {
  return /\b(sk-|ghp_|xai-|AKIA|api[_-]?key\s*[:=]|-----BEGIN)/i.test(text);
}

export function filterIngestTurns(turns: IngestTurn[], forgotten: readonly string[]): DailyLine[] {
  const skip = new Set(forgotten);
  const out: DailyLine[] = [];
  for (const turn of turns) {
    if (skip.has(turn.sessionId)) continue;
    if (turn.role === "tool" || turn.role === "subagent") continue;
    if (looksLikeSecret(turn.text)) continue;
    const kind =
      turn.kind ??
      (turn.role === "user" ? "user_utterance" : null);
    if (!kind) continue;
    if (turn.role === "assistant" && kind !== "agent_commitment") continue;
    out.push({ agentId: turn.agentId, sessionId: turn.sessionId, cwd: turn.cwd, kind, text: turn.text.trim() });
  }
  return out;
}

export function formatDailyFile(day: string, lines: DailyLine[]): string {
  const body = lines.map((l) => `- [${l.agentId} | ${l.sessionId} | ${l.cwd} | ${l.kind}] ${l.text}`).join("\n");
  return `# ${day}\n${body}\n`;
}

export function parseDailyFile(text: string): DailyLine[] {
  const out: DailyLine[] = [];
  for (const line of text.split(/\r?\n/)) {
    const m = line.match(/^- \[(\w+) \| ([^|]+) \| ([^|]+) \| (\w+)\] (.*)$/);
    if (!m) continue;
    const agentId = m[1].trim();
    const kind = m[4].trim();
    if (!isAgentId(agentId)) continue;
    if (kind !== "user_pref" && kind !== "user_utterance" && kind !== "agent_commitment") continue;
    out.push({
      agentId,
      sessionId: m[2].trim(),
      cwd: m[3].trim(),
      kind,
      text: m[5],
    });
  }
  return out;
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npm test -- src/lib/memory-ingest.test.ts`

Expected: PASS

- [ ] **Step 5: Commit**

```bash
git add src/lib/memory-ingest.ts src/lib/memory-ingest.test.ts
git commit -m "feat: filter and tag fused daily memory lines"
```

---

### Task 8: Fusion score and contradiction

**Files:**
- Create: `src/lib/memory-score.ts`
- Create: `src/lib/memory-score.test.ts`

**Interfaces:**
- Consumes: `DailyLine` from `./memory-ingest`
- Produces:
  - `export type MemoryCandidate = { text: string; score: number; sessionIds: string[]; pairs: string[]; sources: DailyLine[] }`
  - `export function supportKey(line: DailyLine): string` — `${agentId}::${cwd}`
  - `export function scoreCandidate(text: string, supports: DailyLine[], modelScore: number): MemoryCandidate`
  - `export function passesDeepGates(c: MemoryCandidate): boolean` — `score >= 0.7`, `sessionIds.length >= 3`, `pairs.length >= 3`
  - `export function shouldKeepExisting(existing: string, incoming: string): boolean` — true when they share a subject token but disagree (incoming does not include the existing clause)

`pairs` = unique `supportKey`. `sessionIds` = unique session ids.

- [ ] **Step 1: Write the failing test**

```ts
import { describe, expect, it } from "vitest";
import type { DailyLine } from "./memory-ingest";
import { passesDeepGates, scoreCandidate, shouldKeepExisting } from "./memory-score";

function line(agentId: DailyLine["agentId"], sessionId: string, cwd: string): DailyLine {
  return { agentId, sessionId, cwd, kind: "user_utterance", text: "prefers vitest" };
}

describe("scoreCandidate", () => {
  it("raises frequency and diversity across agents", () => {
    const c = scoreCandidate("prefers vitest", [
      line("grok", "s1", "/a"),
      line("claude", "s2", "/b"),
      line("kimi", "s3", "/c"),
    ], 0.9);
    expect(c.sessionIds).toHaveLength(3);
    expect(c.pairs).toHaveLength(3);
    expect(passesDeepGates(c)).toBe(true);
  });

  it("fails a single-session fact", () => {
    expect(passesDeepGates(scoreCandidate("x", [line("grok", "s1", "/a")], 0.9))).toBe(false);
  });
});

describe("shouldKeepExisting", () => {
  it("keeps the old line when a new one contradicts it", () => {
    expect(shouldKeepExisting("prefers tabs", "prefers spaces")).toBe(true);
    expect(shouldKeepExisting("prefers tabs", "prefers tabs in Rust")).toBe(false);
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npm test -- src/lib/memory-score.test.ts`

Expected: FAIL

- [ ] **Step 3: Implement**

```ts
import type { DailyLine } from "./memory-ingest";

export type MemoryCandidate = {
  text: string;
  score: number;
  sessionIds: string[];
  pairs: string[];
  sources: DailyLine[];
};

export function supportKey(line: DailyLine): string {
  return `${line.agentId}::${line.cwd}`;
}

export function scoreCandidate(text: string, supports: DailyLine[], modelScore: number): MemoryCandidate {
  const sessionIds = [...new Set(supports.map((s) => s.sessionId))];
  const pairs = [...new Set(supports.map(supportKey))];
  return { text, score: modelScore, sessionIds, pairs, sources: supports };
}

export function passesDeepGates(c: MemoryCandidate): boolean {
  return c.score >= 0.7 && c.sessionIds.length >= 3 && c.pairs.length >= 3;
}

export function shouldKeepExisting(existing: string, incoming: string): boolean {
  const a = existing.toLowerCase();
  const b = incoming.toLowerCase();
  if (b.includes(a) || a.includes(b)) return false;
  const tokens = a.split(/\W+/).filter((t) => t.length > 3);
  return tokens.some((t) => b.includes(t));
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npm test -- src/lib/memory-score.test.ts`

Expected: PASS

- [ ] **Step 5: Commit**

```bash
git add src/lib/memory-score.ts src/lib/memory-score.test.ts
git commit -m "feat: score fused memory candidates and keep contradictions"
```

---

### Task 9: MemoryState and dream orchestration

**Files:**
- Create: `src/lib/memory-state.ts`
- Create: `src/lib/memory-state.test.ts`
- Create: `src/lib/memory-dream.ts`
- Create: `src/lib/memory-dream.test.ts`

**Interfaces:**
- Consumes: `evaluateDreamGates`, `DreamTrigger` from `./memory-gates`; `applyUserMdRewrite` from `./memory-validate`; `AgentId`
- Produces:
  - `export type MemoryState = { lastDeepAt: number | null; lastScanAt: number | null; lockOwner: string | null; cursors: Record<string, number>; forgotten: string[]; userMdPreimage: string | null; lastStatus: "ok" | "failed" | "running" | "blocked-login" | null; lastError: string | null; lastDreamAgentId: AgentId | null }`
  - `export function emptyMemoryState(): MemoryState`
  - `export function parseMemoryState(raw: unknown): MemoryState`
  - `export type DreamPhase = "light" | "rem" | "deep"`
  - `export type DreamIo = { userMd: string; dreamsMd: string; dailyMd: string; state: MemoryState }`
  - `export type PhaseRunner = (phase: DreamPhase, io: DreamIo) => Promise<{ dailyMd?: string; dreamsMd?: string; userMd?: string }>`
  - `export type DreamRunInput = { trigger: DreamTrigger; enabled: boolean; now: number; newSessionCount: number; dreamAgentId: AgentId; loggedIn: readonly AgentId[]; io: DreamIo; runPhase: PhaseRunner }`
  - `export type DreamRunResult = { io: DreamIo; started: boolean; reason?: string }`
  - `export function runDreamSweep(input: DreamRunInput): Promise<DreamRunResult>`

Behavior:

1. If `dreamAgentId` not in `loggedIn` → `started: false`, `state.lastStatus = "blocked-login"`, do not call `runPhase`.
2. Else evaluate gates. Fail → `started: false`, do not lock.
3. Pass → set lock + `lastScanAt` + `lastStatus: "running"`, run light, rem, deep in order.
4. Light writes `dailyMd` from the runner. Light throw → `lastStatus: "failed"`, unlock, keep daily if the runner returned it before throw (runner errors mean no write).
5. REM may omit `dreamsMd`. Deep pipes `userMd` through `applyUserMdRewrite`. If rejected, keep prev `userMd`, append `\n\n未晋升\n` to dreams if dreams changed this run or append a one-line `未晋升` when dreams unchanged.
6. Success Deep: `lastDeepAt = now`, `lastStatus: "ok"`, store `userMdPreimage` from apply, unlock (`lockOwner = null`).

- [ ] **Step 1: Write the failing tests**

```ts
// memory-state.test.ts
import { describe, expect, it } from "vitest";
import { emptyMemoryState, parseMemoryState } from "./memory-state";

describe("parseMemoryState", () => {
  it("defaults missing fields", () => {
    expect(parseMemoryState({})).toEqual(emptyMemoryState());
    expect(parseMemoryState({ lastStatus: "running", lastDreamAgentId: "claude" }).lastDreamAgentId).toBe("claude");
  });
});
```

```ts
// memory-dream.test.ts
import { describe, expect, it } from "vitest";
import { emptyMemoryState } from "./memory-state";
import { runDreamSweep, type PhaseRunner } from "./memory-dream";

const loggedIn = ["grok"] as const;

function io() {
  return {
    userMd: "# You\n- likes tests\n",
    dreamsMd: "",
    dailyMd: "",
    state: emptyMemoryState(),
  };
}

describe("runDreamSweep", () => {
  it("does not start when the dream agent is logged out", async () => {
    const r = await runDreamSweep({
      trigger: "manual",
      enabled: true,
      now: 10,
      newSessionCount: 1,
      dreamAgentId: "grok",
      loggedIn: [],
      io: io(),
      runPhase: async () => ({}),
    });
    expect(r.started).toBe(false);
    expect(r.io.state.lastStatus).toBe("blocked-login");
  });

  it("runs three phases and commits a sourced USER.md", async () => {
    const runPhase: PhaseRunner = async (phase) => {
      if (phase === "light") return { dailyMd: "# 2026-08-30\n- [grok | s1 | /p | user_utterance] hi\n" };
      if (phase === "rem") return { dreamsMd: "## 2026-08-30\nhello\n" };
      return { userMd: "# You\n- likes tests\n- prefers dark mode Source: grok · s1\n" };
    };
    const r = await runDreamSweep({
      trigger: "manual",
      enabled: true,
      now: 50,
      newSessionCount: 1,
      dreamAgentId: "grok",
      loggedIn,
      io: io(),
      runPhase,
    });
    expect(r.started).toBe(true);
    expect(r.io.state.lastStatus).toBe("ok");
    expect(r.io.state.lockOwner).toBe(null);
    expect(r.io.userMd.includes("prefers dark mode")).toBe(true);
  });

  it("rolls back USER.md and notes 未晋升", async () => {
    const r = await runDreamSweep({
      trigger: "manual",
      enabled: true,
      now: 50,
      newSessionCount: 1,
      dreamAgentId: "grok",
      loggedIn,
      io: io(),
      runPhase: async (phase) => {
        if (phase === "deep") return { userMd: "# You\n" };
        return {};
      },
    });
    expect(r.io.userMd).toBe("# You\n- likes tests\n");
    expect(r.io.dreamsMd.includes("未晋升")).toBe(true);
  });
});
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `npm test -- src/lib/memory-state.test.ts src/lib/memory-dream.test.ts`

Expected: FAIL

- [ ] **Step 3: Implement**

```ts
// memory-state.ts
import { isAgentId, type AgentId } from "./agent-id";

export type MemoryStatus = "ok" | "failed" | "running" | "blocked-login";

export type MemoryState = {
  lastDeepAt: number | null;
  lastScanAt: number | null;
  lockOwner: string | null;
  cursors: Record<string, number>;
  forgotten: string[];
  userMdPreimage: string | null;
  lastStatus: MemoryStatus | null;
  lastError: string | null;
  lastDreamAgentId: AgentId | null;
};

export function emptyMemoryState(): MemoryState {
  return {
    lastDeepAt: null,
    lastScanAt: null,
    lockOwner: null,
    cursors: {},
    forgotten: [],
    userMdPreimage: null,
    lastStatus: null,
    lastError: null,
    lastDreamAgentId: null,
  };
}

export function parseMemoryState(raw: unknown): MemoryState {
  const base = emptyMemoryState();
  if (!raw || typeof raw !== "object") return base;
  const row = raw as Record<string, unknown>;
  const status = row.lastStatus;
  const agent = row.lastDreamAgentId;
  return {
    lastDeepAt: typeof row.lastDeepAt === "number" ? row.lastDeepAt : null,
    lastScanAt: typeof row.lastScanAt === "number" ? row.lastScanAt : null,
    lockOwner: typeof row.lockOwner === "string" ? row.lockOwner : null,
    cursors: row.cursors && typeof row.cursors === "object" ? (row.cursors as Record<string, number>) : {},
    forgotten: Array.isArray(row.forgotten) ? row.forgotten.filter((x) => typeof x === "string") : [],
    userMdPreimage: typeof row.userMdPreimage === "string" ? row.userMdPreimage : null,
    lastStatus: status === "ok" || status === "failed" || status === "running" || status === "blocked-login" ? status : null,
    lastError: typeof row.lastError === "string" ? row.lastError : null,
    lastDreamAgentId: typeof agent === "string" && isAgentId(agent) ? agent : null,
  };
}

// memory-dream.ts
import type { AgentId } from "./agent-id";
import { evaluateDreamGates, type DreamTrigger } from "./memory-gates";
import { applyUserMdRewrite } from "./memory-validate";
import { emptyMemoryState, type MemoryState } from "./memory-state";

export type DreamPhase = "light" | "rem" | "deep";
export type DreamIo = { userMd: string; dreamsMd: string; dailyMd: string; state: MemoryState };
export type PhaseRunner = (phase: DreamPhase, io: DreamIo) => Promise<{ dailyMd?: string; dreamsMd?: string; userMd?: string }>;
export type DreamRunInput = {
  trigger: DreamTrigger;
  enabled: boolean;
  now: number;
  newSessionCount: number;
  dreamAgentId: AgentId;
  loggedIn: readonly AgentId[];
  io: DreamIo;
  runPhase: PhaseRunner;
};
export type DreamRunResult = { io: DreamIo; started: boolean; reason?: string };

function withState(io: DreamIo, patch: Partial<MemoryState>): DreamIo {
  return { ...io, state: { ...io.state, ...patch } };
}

function noteUnpromoted(dreamsMd: string): string {
  return `${dreamsMd.trim() ? dreamsMd.replace(/\s*$/, "\n\n") : ""}未晋升\n`;
}

export async function runDreamSweep(input: DreamRunInput): Promise<DreamRunResult> {
  let io = { ...input.io, state: { ...input.io.state } };
  io = withState(io, { lastDreamAgentId: input.dreamAgentId });
  if (!input.loggedIn.includes(input.dreamAgentId)) {
    return { io: withState(io, { lastStatus: "blocked-login" }), started: false, reason: "blocked-login" };
  }
  const gate = evaluateDreamGates({
    enabled: input.enabled,
    now: input.now,
    lastDeepAt: io.state.lastDeepAt,
    lastScanAt: io.state.lastScanAt,
    newSessionCount: input.newSessionCount,
    lockHeld: !!io.state.lockOwner,
    trigger: input.trigger,
  });
  if (!gate.ok) return { io, started: false, reason: gate.reason };

  io = withState(io, { lockOwner: "dream", lastScanAt: input.now, lastStatus: "running", lastError: null });
  try {
    const light = await input.runPhase("light", io);
    if (light.dailyMd != null) io = { ...io, dailyMd: light.dailyMd };
    const rem = await input.runPhase("rem", io);
    if (rem.dreamsMd != null) io = { ...io, dreamsMd: rem.dreamsMd };
    const deep = await input.runPhase("deep", io);
    if (deep.userMd != null) {
      const applied = applyUserMdRewrite(io.userMd, deep.userMd);
      io = {
        ...io,
        userMd: applied.file,
        state: { ...io.state, userMdPreimage: applied.preimage },
      };
      if (applied.rejected) io = { ...io, dreamsMd: noteUnpromoted(io.dreamsMd) };
    }
    io = withState(io, { lastDeepAt: input.now, lastStatus: "ok", lockOwner: null });
    return { io, started: true };
  } catch (e) {
    return {
      io: withState(io, { lastStatus: "failed", lastError: String(e), lockOwner: null }),
      started: true,
      reason: "failed",
    };
  }
}

```

- [ ] **Step 4: Run tests to verify they pass**

Run: `npm test -- src/lib/memory-state.test.ts src/lib/memory-dream.test.ts`

Expected: PASS

- [ ] **Step 5: Commit**

```bash
git add src/lib/memory-state.ts src/lib/memory-state.test.ts src/lib/memory-dream.ts src/lib/memory-dream.test.ts
git commit -m "feat: orchestrate light rem deep memory sweeps"
```

---

### Task 10: Schedule

**Files:**
- Create: `src/lib/memory-schedule.ts`
- Create: `src/lib/memory-schedule.test.ts`

**Interfaces:**
- Consumes: `localDayStamp` from `./memory-clock`
- Produces:
  - `export function nextLocalHour(now: number, timeZone: string, hour: number): number` — next occurrence of `hour:00` in that zone (03:00)
  - `export function shouldCatchUp(args: { now: number; lastDeepAt: number | null; timeZone: string }): boolean` — true when `lastDeepAt` is null or its local day is before today’s local day

- [ ] **Step 1: Write the failing test**

```ts
import { describe, expect, it } from "vitest";
import { nextLocalHour, shouldCatchUp } from "./memory-schedule";

describe("nextLocalHour", () => {
  it("returns a later 03:00 in UTC", () => {
    const now = Date.parse("2026-08-30T04:00:00Z");
    const next = nextLocalHour(now, "UTC", 3);
    expect(next).toBe(Date.parse("2026-08-31T03:00:00Z"));
  });
});

describe("shouldCatchUp", () => {
  it("catches up when yesterday never dreamed", () => {
    expect(shouldCatchUp({ now: Date.parse("2026-08-31T10:00:00Z"), lastDeepAt: Date.parse("2026-08-30T03:00:00Z"), timeZone: "UTC" })).toBe(true);
    expect(shouldCatchUp({ now: Date.parse("2026-08-30T10:00:00Z"), lastDeepAt: Date.parse("2026-08-30T03:00:00Z"), timeZone: "UTC" })).toBe(false);
    expect(shouldCatchUp({ now: Date.parse("2026-08-30T10:00:00Z"), lastDeepAt: null, timeZone: "UTC" })).toBe(true);
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npm test -- src/lib/memory-schedule.test.ts`

Expected: FAIL

- [ ] **Step 3: Implement**

```ts
import { localDayStamp } from "./memory-clock";

function hourInZone(ms: number, timeZone: string): number {
  const raw = new Intl.DateTimeFormat("en-US", { timeZone, hour: "numeric", hour12: false }).format(new Date(ms));
  return Number.parseInt(raw, 10);
}

export function nextLocalHour(now: number, timeZone: string, hour: number): number {
  let t = now + 60 * 60 * 1000;
  for (let i = 0; i < 48; i++) {
    if (hourInZone(t, timeZone) === hour) {
      const floored = t - (t % (60 * 60 * 1000));
      return floored;
    }
    t += 60 * 60 * 1000;
  }
  return now + 24 * 60 * 60 * 1000;
}

export function shouldCatchUp(args: { now: number; lastDeepAt: number | null; timeZone: string }): boolean {
  if (args.lastDeepAt == null) return true;
  return localDayStamp(args.lastDeepAt, args.timeZone) < localDayStamp(args.now, args.timeZone);
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npm test -- src/lib/memory-schedule.test.ts`

Expected: PASS

- [ ] **Step 5: Commit**

```bash
git add src/lib/memory-schedule.ts src/lib/memory-schedule.test.ts
git commit -m "feat: schedule 03:00 dreams and launch catch-up"
```

---

### Task 11: Overlay view model

**Files:**
- Create: `src/lib/memory-view.ts`
- Create: `src/lib/memory-view.test.ts`

**Interfaces:**
- Consumes: `AgentId`; `DailyLine` / `parseDailyFile` from `./memory-ingest`; `MemoryState` from `./memory-state`
- Produces:
  - `export type DiaryEntry = { date: string; body: string }`
  - `export function parseDreamsMd(text: string): DiaryEntry[]` — split on `## YYYY-MM-DD`
  - `export function corpusLine(lines: DailyLine[]): string | null` — `今日语料：Grok 4 · Claude 2` using labels `{ grok: "Grok", kimi: "Kimi", claude: "Claude", codex: "Codex" }`, omit zero counts, preserve AGENT_IDS order
  - `export type OverlayStatus = { kind: "running" } | { kind: "failed" } | { kind: "blocked-login"; agentId: AgentId } | { kind: "pending"; sessionCount: number } | { kind: "idle"; lastAt: number | null }`
  - `export function overlayStatus(state: MemoryState, pendingSessions: number): OverlayStatus`

Priority: running > blocked-login > failed > pending (`pendingSessions > 0`) > idle.

- [ ] **Step 1: Write the failing test**

```ts
import { describe, expect, it } from "vitest";
import { emptyMemoryState } from "./memory-state";
import { corpusLine, overlayStatus, parseDreamsMd } from "./memory-view";

describe("parseDreamsMd", () => {
  it("reads dated entries newest-last in file order", () => {
    const entries = parseDreamsMd("## 2026-08-29\nold\n\n## 2026-08-30\nnew\n");
    expect(entries).toEqual([
      { date: "2026-08-29", body: "old" },
      { date: "2026-08-30", body: "new" },
    ]);
  });
});

describe("corpusLine", () => {
  it("lists only agents that spoke", () => {
    expect(corpusLine([
      { agentId: "grok", sessionId: "a", cwd: "/p", kind: "user_utterance", text: "1" },
      { agentId: "grok", sessionId: "b", cwd: "/p", kind: "user_utterance", text: "2" },
      { agentId: "claude", sessionId: "c", cwd: "/p", kind: "user_utterance", text: "3" },
    ])).toBe("今日语料：Grok 2 · Claude 1");
    expect(corpusLine([])).toBe(null);
  });
});

describe("overlayStatus", () => {
  it("prefers running then login then failed", () => {
    expect(overlayStatus({ ...emptyMemoryState(), lastStatus: "running" }, 0)).toEqual({ kind: "running" });
    expect(overlayStatus({ ...emptyMemoryState(), lastStatus: "blocked-login", lastDreamAgentId: "grok" }, 0)).toEqual({
      kind: "blocked-login",
      agentId: "grok",
    });
    expect(overlayStatus({ ...emptyMemoryState(), lastStatus: "failed" }, 0)).toEqual({ kind: "failed" });
    expect(overlayStatus(emptyMemoryState(), 3)).toEqual({ kind: "pending", sessionCount: 3 });
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npm test -- src/lib/memory-view.test.ts`

Expected: FAIL

- [ ] **Step 3: Implement**

```ts
import { AGENT_IDS, type AgentId } from "./agent-id";
import type { DailyLine } from "./memory-ingest";
import type { MemoryState } from "./memory-state";

export type DiaryEntry = { date: string; body: string };

const LABELS: Record<AgentId, string> = {
  grok: "Grok",
  kimi: "Kimi",
  claude: "Claude",
  codex: "Codex",
};

export function parseDreamsMd(text: string): DiaryEntry[] {
  const chunks = text.split(/^## /m).map((c) => c.trim()).filter(Boolean);
  const out: DiaryEntry[] = [];
  for (const chunk of chunks) {
    const nl = chunk.indexOf("\n");
    const date = (nl < 0 ? chunk : chunk.slice(0, nl)).trim();
    const body = nl < 0 ? "" : chunk.slice(nl + 1).trim();
    if (/^\d{4}-\d{2}-\d{2}$/.test(date)) out.push({ date, body });
  }
  return out;
}

export function selectedDiary(entries: DiaryEntry[], date: string | null): DiaryEntry | null {
  if (!entries.length) return null;
  return entries.find((e) => e.date === date) ?? entries[entries.length - 1] ?? null;
}

export function corpusLine(lines: DailyLine[]): string | null {
  const counts = new Map<AgentId, number>();
  for (const line of lines) counts.set(line.agentId, (counts.get(line.agentId) ?? 0) + 1);
  const parts = AGENT_IDS.filter((id) => (counts.get(id) ?? 0) > 0).map((id) => `${LABELS[id]} ${counts.get(id)}`);
  return parts.length ? `今日语料：${parts.join(" · ")}` : null;
}

export type OverlayStatus =
  | { kind: "running" }
  | { kind: "failed" }
  | { kind: "blocked-login"; agentId: AgentId }
  | { kind: "pending"; sessionCount: number }
  | { kind: "idle"; lastAt: number | null };

export function overlayStatus(state: MemoryState, pendingSessions: number): OverlayStatus {
  if (state.lastStatus === "running") return { kind: "running" };
  if (state.lastStatus === "blocked-login") return { kind: "blocked-login", agentId: state.lastDreamAgentId ?? "grok" };
  if (state.lastStatus === "failed") return { kind: "failed" };
  if (pendingSessions > 0) return { kind: "pending", sessionCount: pendingSessions };
  return { kind: "idle", lastAt: state.lastDeepAt };
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npm test -- src/lib/memory-view.test.ts`

Expected: PASS

- [ ] **Step 5: Commit**

```bash
git add src/lib/memory-view.ts src/lib/memory-view.test.ts
git commit -m "feat: derive memory overlay diary and status"
```

---

### Task 12: Persist keys and i18n

**Files:**
- Modify: `src/api.ts` (`WebuiState`)
- Modify: `src/hooks/useWebuiPersist.ts` (`WebuiSnapshot`)
- Modify: `src/hooks/useWebuiPersist.test.ts`
- Modify: `src/lib/i18n.ts`
- Modify: `src/lib/i18n.test.ts` only if a new assertion is needed; key parity test already covers keys

**Interfaces:**
- Consumes: `MemorySettings` field names from Task 2
- Produces: optional `injectUserMemory?: boolean`, `dreamingEnabled?: boolean`, `dreamAgentId?: AgentId` on `WebuiState` and `WebuiSnapshot`

Copy (add both ZH and EN):

| key | zh | en |
|---|---|---|
| `settings.injectUserMemory` | 用户画像注入 | Inject user profile |
| `settings.dreamingEnabled` | 每天自动做梦 | Daily dreaming |
| `settings.dreamAgentId` | 做梦使用 | Dream with |
| `memory.loadedChip` | 已加载记忆 | Memory loaded |
| `memory.dreamNow` | 做一场梦 | Dream now |
| `memory.openUserMd` | 打开 USER.md | Open USER.md |
| `memory.projectFiles` | 项目文件 | Project files |
| `memory.statusRunning` | 正在做梦 | Dreaming |
| `memory.statusFailed` | 做梦失败，将在下次启动重试 | Dream failed. Will retry on next launch. |
| `memory.statusBlocked` | 做梦失败：{agent} 未登录 | Dream failed: {agent} is signed out |
| `memory.statusPending` | 有 {n} 场会话待消化 | {n} sessions waiting to digest |
| `memory.statusIdle` | 上次做梦 · {when} | Last dream · {when} |
| `memory.dockUpdated` | 画像已更新 | Profile updated |
| `memory.lockHeld` | 已有一场梦在跑 | A dream is already running |

- [ ] **Step 1: Write the failing persist assertion**

Add to `useWebuiPersist.test.ts` `base` the three fields (`true`, `true`, `"grok"`). Add:

```ts
it("keeps memory settings on the snapshot", () => {
  expect(buildWebuiState({ ...base, injectUserMemory: false, dreamAgentId: "claude" }, {}).dreamAgentId).toBe("claude");
});
```

Add to `i18n.test.ts`:

```ts
it("has user-memory settings copy", () => {
  expect(t("zh", "settings.injectUserMemory")).toBe("用户画像注入");
  expect(t("en", "settings.dreamAgentId")).toBe("Dream with");
});
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `npm test -- src/hooks/useWebuiPersist.test.ts src/lib/i18n.test.ts`

Expected: FAIL (missing fields / keys)

- [ ] **Step 3: Add the three optional fields to both types and both locale tables. Update the persist test `base` object.**

- [ ] **Step 4: Run tests to verify they pass**

Run: `npm test -- src/hooks/useWebuiPersist.test.ts src/lib/i18n.test.ts`

Expected: PASS

- [ ] **Step 5: Commit**

```bash
git add src/api.ts src/hooks/useWebuiPersist.ts src/hooks/useWebuiPersist.test.ts src/lib/i18n.ts src/lib/i18n.test.ts
git commit -m "feat: persist user-memory settings and copy"
```

---

### Task 13: Settings rows

**Files:**
- Modify: `src/Settings.tsx` — add optional props after `onSteerByDefault`:
  - `injectUserMemory?: boolean`
  - `onInjectUserMemory?: (v: boolean) => void`
  - `dreamingEnabled?: boolean`
  - `onDreamingEnabled?: (v: boolean) => void`
  - `dreamAgentId?: string`
  - `onDreamAgentId?: (id: string) => void`
  - `dreamAgentOptions?: { id: string; label: string }[]`
- Modify: `src/App.tsx` (or wherever `<Settings` is rendered) to pass parsed settings + persist
- Modify: `src/hooks/useAppModel.ts` only if that is where settings state lives

**Interfaces:**
- Consumes: `parseMemorySettings`, `canSaveDreamAgent`, `t()`, existing Grok `settings.memory` row
- Produces: three rows immediately under the existing 跨会话记忆 toggle. Dream-agent `MenuSelect` options = `dreamAgentOptions` (logged-in doctors only). `onDreamAgentId` no-ops when `!canSaveDreamAgent`.

Turning inject off does not call `onDreamingEnabled`. Turning dreaming off does not call `onInjectUserMemory`.

Search: add the new labels to the existing `chatMemory` haystack in `Settings.tsx` so they stay visible with the chat section.

- [ ] **Step 1: Write a small extract test if Settings has no test file**

Create `src/lib/memory-settings-ui.ts`:

```ts
export function nextDreamAgent(id: string, loggedIn: readonly import("./agent-id").AgentId[]): string | null {
  return canSaveDreamAgent(id, loggedIn) ? id : null;
}
```

Test: `nextDreamAgent("claude", ["grok"]) === null`, `nextDreamAgent("grok", ["grok"]) === "grok"`.

This is the handler Settings must call.

- [ ] **Step 2: Run the extract test (fail then implement via Task 2’s `canSaveDreamAgent`)**

- [ ] **Step 3: Add the three rows next to the Grok memory toggle. Wire App persist `{ injectUserMemory, dreamingEnabled, dreamAgentId }`.**

Doctor options: from `doctorAll` / existing doctors list, `id` where logged in, labels `Grok|Kimi|Claude|Codex`.

- [ ] **Step 4: Run `npm test -- src/lib/memory-settings.test.ts src/lib/i18n.test.ts`**

Expected: PASS

- [ ] **Step 5: Commit**

```bash
git add src/Settings.tsx src/App.tsx src/hooks/useAppModel.ts src/lib/memory-settings-ui.ts src/lib/memory-settings-ui.test.ts
git commit -m "feat: add user-memory toggles and dream CLI picker"
```

Only add files you actually touched.

---

### Task 14: Memory overlay chrome

**Files:**
- Create: `src/components/MemoryDreamPane.tsx`
- Modify: `src/components/MemoryWorkspace.tsx`
- Modify: `src/components/ExtraOverlay.tsx` — pass diary / status / handlers
- Modify: `src/styles/settings.css` or `src/styles.css` — two-column overlay, no new route

**Interfaces:**
- Consumes: `DiaryEntry`, `OverlayStatus`, `corpusLine` from `memory-view`
- Produces: left diary + status + `做一场梦` / `打开 USER.md`; right timeline of `entries.map(e => e.date)`; bottom `<details>` “项目文件” wrapping the existing MEMORY.md / AGENTS.md rows

Empty diary: left shows status only, no fake day. Dream button `disabled` when `status.kind === "running"`.

- [ ] **Step 1: Extract a pure picker already covered by `parseDreamsMd`. Add `src/lib/memory-view` test that `entries.at(-1)` is the default selection.**

```ts
export function selectedDiary(entries: DiaryEntry[], date: string | null): DiaryEntry | null {
  if (!entries.length) return null;
  return entries.find((e) => e.date === date) ?? entries[entries.length - 1] ?? null;
}
```

- [ ] **Step 2: Fail then implement `selectedDiary`.**

- [ ] **Step 3: Build `MemoryDreamPane` and fold project files under `<details className="memory-project-files">`.**

Do not remove `DocRow` / `MemoryEditor`.

- [ ] **Step 4: Run `npm test -- src/lib/memory-view.test.ts`**

Expected: PASS

- [ ] **Step 5: Commit**

```bash
git add src/lib/memory-view.ts src/lib/memory-view.test.ts src/components/MemoryDreamPane.tsx src/components/MemoryWorkspace.tsx src/components/ExtraOverlay.tsx src/styles.css
git commit -m "feat: show dream diary and timeline in memory overlay"
```

---

### Task 15: First-prompt inject + chip

**Files:**
- Create: `src/components/MemoryInjectChip.tsx`
- Modify: `src/hooks/useAcpSession.ts` — `sendPrompt` wraps `text` through `wrapFirstPrompt` before `rpc("session/prompt")` and before `withEchoedUser` uses the **unwrapped** user text
- Modify: `src/App.tsx` / composer slot — render chip when `injectedSessions` has the current session
- Modify: `src/hooks/useAcpSession.test.ts` if a wrap helper is tested there; prefer testing via `wrapFirstPrompt` already shipped

**Interfaces:**
- Consumes: `wrapFirstPrompt` from `./memory-inject`
- Produces: per-session `Set<string>` of injected session ids (in-memory only). Chip click → `setExtraPage("memory")`. Dismiss removes that session from the set only.

`sendPrompt` echo path must keep showing `text` (user words), while ACP receives `wrapped.text`. If wrap throws, send original `text` (try/catch around wrap only).

Steer / queue / slash paths do **not** wrap.

- [ ] **Step 1: Add `src/lib/memory-inject-session.ts`**

```ts
export function markInjected(ids: ReadonlySet<string>, sessionId: string, injected: boolean): Set<string> {
  const next = new Set(ids);
  if (injected) next.add(sessionId);
  return next;
}

export function dismissInjected(ids: ReadonlySet<string>, sessionId: string): Set<string> {
  const next = new Set(ids);
  next.delete(sessionId);
  return next;
}
```

Test both.

- [ ] **Step 2: Run fail then implement.**

- [ ] **Step 3: In `sendPrompt`, after slash handling and before echo:**

```ts
const sidGuess = extra ? d.extraPanes[dest]?.sessionId : sessionIdRef.current;
const wrap = wrapFirstPrompt({
  sessionId: sidGuess || "pending",
  alreadyInjected: sidGuess ? injectedRef.current.has(sidGuess) : false,
  injectOn: d.injectUserMemory,
  userMd: d.userMd,
  userText: text,
});
const acpText = wrap.text;
// echo `text`; rpc prompt uses `acpText`
// after sid is known, if wrap.injected then injectedRef.add(sid)
```

If `session/new` happens inside `sendPrompt` after wrap used `"pending"`, re-wrap is not required for this turn (already computed). Mark the real `sid`.

Chip: `MemoryInjectChip` button + dismiss. Place in the existing composer top slot (same region as MemoryDock).

- [ ] **Step 4: Run `npm test -- src/lib/memory-inject.test.ts src/lib/memory-inject-session.test.ts src/hooks/useAcpSession.test.ts`**

Expected: PASS

- [ ] **Step 5: Commit**

```bash
git add src/lib/memory-inject-session.ts src/lib/memory-inject-session.test.ts src/components/MemoryInjectChip.tsx src/hooks/useAcpSession.ts src/App.tsx
git commit -m "feat: inject compact USER.md on a session first prompt"
```

---

### Task 16: Local `/dream`

**Files:**
- Modify: `src/lib/commands.ts` — `{ name: "/dream", hint: "整理记忆", local: "dream" }`
- Modify: `src/lib/commands.test.ts` — assert `local === "dream"`
- Modify: `src/hooks/useSlashCommands.ts` — `local === "dream"` clears draft and calls `d.onDreamNow?.()`
- Modify: `SlashCommandDeps` with `onDreamNow: () => void`
- Modify: `src/lib/palette.ts` if a memory action should also dream (optional; skip unless a palette item already says 做梦)

**Interfaces:**
- Consumes: existing `CommandDef.local` union — add `"dream"`
- Produces: `/dream` never hits `session/prompt`

Lock toast: `onDreamNow` is provided by Task 18; for this task the dep can be a no-op in tests and a real callback once the hook exists. Add `onDreamNow` now so Task 18 only fills the body.

- [ ] **Step 1: Extend `commands.test.ts`**

```ts
it("runs /dream on the desktop", () => {
  const dream = SLASH_COMMANDS.find((c) => c.name === "/dream");
  expect(dream?.local).toBe("dream");
});
```

- [ ] **Step 2: Run fail (local is undefined).**

- [ ] **Step 3: Add `"dream"` to the `local` union and the handler next to `memory`.**

- [ ] **Step 4: Run `npm test -- src/lib/commands.test.ts`**

Expected: PASS

- [ ] **Step 5: Commit**

```bash
git add src/lib/commands.ts src/lib/commands.test.ts src/hooks/useSlashCommands.ts
git commit -m "feat: run /dream as a local desktop sweep"
```

---

### Task 17: Rust memory host

**Files:**
- Create: `src-tauri/src/memory_host.rs`
- Modify: `src-tauri/src/lib.rs` — `mod memory_host;` and register `read_memory_host`, `write_memory_host`
- Modify: `src/api.ts` — `readMemoryHost`, `writeMemoryHost`

**Interfaces:**
- Consumes: workbench home from env `ACP_WORKBENCH_HOME` or `~/.acp-workbench` (same as workbench_state if that helper exists; otherwise `dirs::home_dir().join(".acp-workbench")`)
- Produces:
  - `read_memory_host() -> { userMd, dreamsMd, dailyMd, stateJson, memoryRoot }` where `dailyMd` is today’s file or `""`
  - `write_memory_host({ userMd?, dreamsMd?, dailyMd?, dailyDay?, stateJson? })` writes only provided fields, creates `daily/` and `.dreams/`

Max file size 64 KiB each. Paths must stay under `{wb}/memory`. Tests use a temp dir argument `memory_host::read_at(root)` / `write_at(root, patch)` so they never touch `$HOME`.

- [ ] **Step 1: Write Rust unit tests in `memory_host.rs` for `read_at` / `write_at` on `tempdir`.**

- [ ] **Step 2: `cargo test --manifest-path src-tauri/Cargo.toml memory_host -- --nocapture` — FAIL**

- [ ] **Step 3: Implement. In `lib.rs` add `mod memory_host;` and two commands that call `read_at`/`write_at` on the resolved workbench memory root. Do not refactor other commands.**

- [ ] **Step 4: Re-run the cargo test. Expected: PASS**

- [ ] **Step 5: Commit**

```bash
git add src-tauri/src/memory_host.rs src-tauri/src/lib.rs src/api.ts
git commit -m "feat: persist USER.md and dream state under workbench memory"
```

---

### Task 18: Dream runner hook

**Files:**
- Create: `src/hooks/useDreamJob.ts`
- Create: `src/lib/memory-phase-prompt.ts`
- Create: `src/lib/memory-phase-prompt.test.ts`
- Modify: `src/hooks/useAppModel.ts` — launch catch-up + 03:00 timeout + `onDreamNow`
- Modify: `src/components/MemoryDock.tsx` usage in `App.tsx` — also show `memory.dockUpdated` when Deep rewrote `USER.md`

**Interfaces:**
- Consumes: `runDreamSweep`, `readMemoryHost` / `writeMemoryHost`, `shouldCatchUp`, `nextLocalHour`, `evaluateDreamGates`
- Produces: `onDreamNow()` and an effect that:
  1. On mount, `readMemoryHost`; if `shouldCatchUp` and gates would pass except the 20h/session skips used by `trigger: "launch"`, run.
  2. `setTimeout` until `nextLocalHour(now, tz, 3)` then run with `trigger: "schedule"`.
  3. `runPhase` opens a dedicated ACP session on `dreamAgentId` with cwd = `memoryRoot`, one `session/prompt` per phase from `phasePrompt(phase, io)`, then `session/cancel` or process stop if a helper exists; otherwise leave the short session idle.

`phasePrompt`:

- light: ask for a replacement `daily/YYYY-MM-DD.md` body only
- rem: ask for one `## YYYY-MM-DD` diary appendix; forbid `USER.md` edits
- deep: ask for a full `USER.md`; remind Source: and 8KiB

If `runPhase` cannot start ACP: return `{ started: false }` path by throwing; hook maps to `lastStatus: "failed"` via a failed sweep write.

Manual `/dream` / overlay button: `trigger: "manual"`. If gates say `locked`, `showToast(t(locale, "memory.lockHeld"))`.

Logged-out: do not call ACP; persist `blocked-login`.

Grok P0 ingest: after lock, before `runPhase("light")`, the hook may append filtered turns from `read_session_updates` for sessions newer than cursors. Convert ACP user/assistant chunks to `IngestTurn` (`role: "tool"` when `sessionUpdate` is a tool event). Update `state.cursors[memoryCursorKey] = byteOffset`. If this conversion is large, put it in `src/lib/memory-grok-turns.ts` with a fixture test. **Do not skip this conversion** — Light must see real Grok text in P0.

- [ ] **Step 1: Write `phasePrompt` tests** (light mentions `daily`, rem forbids `USER.md`, deep requires `Source:`).

- [ ] **Step 2: Fail then implement prompts.**

- [ ] **Step 3: Write `memory-grok-turns.ts` tests with a tiny updates fixture; implement; wire `useDreamJob`.**

- [ ] **Step 4: Run `npm test -- src/lib/memory-phase-prompt.test.ts src/lib/memory-grok-turns.test.ts src/lib/memory-dream.test.ts`**

Expected: PASS

- [ ] **Step 5: Commit**

```bash
git add src/lib/memory-phase-prompt.ts src/lib/memory-phase-prompt.test.ts src/lib/memory-grok-turns.ts src/lib/memory-grok-turns.test.ts src/hooks/useDreamJob.ts src/hooks/useAppModel.ts src/App.tsx
git commit -m "feat: run catch-up and nightly dreams on the chosen CLI"
```

---

## Self-review

**Spec coverage**

| Spec section | Task |
|---|---|
| Store paths / JSON state | 1, 9, 17 |
| Settings + no silent CLI fallback | 2, 12, 13, 18 |
| Gates + manual skips | 3, 9, 18 |
| Fusion ingest + cursors + forgotten | 4, 7, 18 |
| Compact + first-prompt inject + chip | 5, 15 |
| USER.md validators / rollback / 未晋升 | 6, 9 |
| Score + contradiction keep | 8 |
| Light/REM/Deep + dedicated ACP | 9, 18 |
| 03:00 + launch catch-up | 10, 18 |
| Overlay diary / timeline / project fold | 11, 14 |
| `/dream` local | 16 |
| Grok `updates.jsonl` P0 | 18 |
| Never write CLI MEMORY.md | Global + 17 only writes workbench memory |
| Other CLIs ingest | Follow-on |

**Placeholders:** none of the forbidden “TBD / implement later / similar to Task N” forms remain in executable steps.

**Type names** used later match Tasks 2–11: `MemorySettings`, `DreamTrigger`, `wrapFirstPrompt`, `DailyLine`, `MemoryState`, `runDreamSweep`, `OverlayStatus`.
