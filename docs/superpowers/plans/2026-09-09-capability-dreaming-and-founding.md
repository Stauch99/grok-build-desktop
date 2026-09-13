# Capability Dreaming and Founding Dream Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Turn nightly dreaming into a teaching-moment capability review, and add a one-shot founding dream that re-reads Grok+Claude history on Kimi Code K3 1M.

**Architecture:** Keep the Memory Host and 64 KiB shard cap. Local TeachExtract classifies turns before any model call. Nightly still one bounded `main` prompt on `settings.dreamAgentId`. Founding is a separate job: always `kimi acp` + `pickFoundingKimiModel` (K3 1M, never 256k), one prompt if packed episodes ≤ 400k chars, otherwise domain split. Skill YAML lands in a pending queue; growth-page approve writes `~/.grok/skills/<id>/SKILL.md`.

**Tech Stack:** TypeScript + Vitest, existing Tauri `read_session_updates` / `write_memory_host`. No new npm or cargo dependencies. No YAML library — parse skill stubs as `key: value` blocks.

**Spec:** `docs/superpowers/specs/2026-09-09-capability-dreaming-and-founding-design.md`

## Global Constraints

- Do not vendor Hermes, Mem0, Letta, Graphiti, Hindsight, or claude-mem.
- Do not raise `MAX_FILE_BYTES` (64 KiB). `USER.md` stays ≤8 KiB.
- Do not rewrite `~/.kimi-code/config.toml`. Do not fall founding back to Grok or `k3-256k`.
- Do not write `MEMORY.md` / `AGENTS.md`. Approved skills go only to `~/.grok/skills/<id>/SKILL.md`.
- Founding does not rewind nightly `cursors`.
- Skip Claude-mem observer paths, Claude subagents, dream sessions, harness text, secrets, `<user-memory>` echo.
- ZH/EN i18n keys stay in parity (`src/lib/i18n.test.ts` key-parity).
- TDD: failing test first. `npx vitest run <file>`. Playwright e2e only in the UI task.
- Leave dirty unrelated working-tree files alone. Commit format: `<type>: <description>` with no attribution footer.
- CSS/UI: no new theme families. Overlay copy only.

## File map

| File | Responsibility |
|---|---|
| `src/lib/memory-founding-model.ts` | `pickFoundingKimiModel` |
| `src/lib/memory-teach.ts` | `stripInjectedMemory`, `extractTeachLines` |
| `src/lib/memory-ingest.ts` | `teach_episode` kind; parse/format |
| `src/lib/memory-grok-turns.ts` | Stage teach/pref lines; `skipFoundingSession` |
| `src/lib/memory-phase-prompt.ts` | Warm diary + `<<<SKILLS>>>`; `parseSkillStubs` |
| `src/lib/memory-weight.ts` | Weight `teach_episode` highest |
| `src/lib/memory-founding-cluster.ts` | Domain key, collapse to 12, one-shot vs split |
| `src/lib/memory-founding-prompt.ts` | Founding / domain / merge prompt strings |
| `src/lib/memory-paths.ts` | founding shards + skill-proposal paths |
| `src/lib/memory-state.ts` | `foundingAt` / status / cursors / modelId |
| `src/lib/memory-skill-proposal.ts` | pending file parse, approve, dismiss |
| `src/lib/memory-dream-acp.ts` | founding timeout; `/model` + `/effort max` |
| `src/hooks/useDreamJob.ts` | Claude ingest; `runFounding` |
| `src/components/memory-growth/*`, `src/lib/i18n.ts` | 大梦 menu, proposal list |
| Tests next to each file | Spec “Testing” list |

---

### Task 1: Pick Kimi K3 1M

**Files:**
- Create: `src/lib/memory-founding-model.ts`
- Create: `src/lib/memory-founding-model.test.ts`

**Interfaces:**
- Consumes: catalog model ids (strings from the Kimi composer catalog)
- Produces: `export function pickFoundingKimiModel(catalogIds: readonly string[]): string | null`

- [ ] **Step 1: Write the failing tests**

```ts
import { describe, expect, it } from "vitest";
import { pickFoundingKimiModel } from "./memory-founding-model";

describe("pickFoundingKimiModel", () => {
  it("prefers kimi-code/k3 over a bare k3 and over aliases", () => {
    expect(pickFoundingKimiModel(["k3", "kimi-code/k3", "ark-plan/kimi-k3"])).toBe("kimi-code/k3");
  });

  it("accepts exact k3 when the preferred id is missing", () => {
    expect(pickFoundingKimiModel(["kimi-for-coding", "k3"])).toBe("k3");
  });

  it("accepts a renamed K3 1M alias", () => {
    expect(pickFoundingKimiModel(["ark-plan/kimi-k3"])).toBe("ark-plan/kimi-k3");
  });

  it("rejects 256k and K2.7 even if they are the only rows", () => {
    expect(pickFoundingKimiModel(["k3-256k", "kimi-code/k3-256k", "kimi-for-coding", "kimi-for-coding-highspeed"])).toBe(null);
  });

  it("returns null on an empty catalog", () => {
    expect(pickFoundingKimiModel([])).toBe(null);
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx vitest run src/lib/memory-founding-model.test.ts`
Expected: FAIL on missing module.

- [ ] **Step 3: Implement**

```ts
export function pickFoundingKimiModel(catalogIds: readonly string[]): string | null {
  const ids = catalogIds.map((id) => id.trim()).filter(Boolean);
  if (ids.includes("kimi-code/k3")) return "kimi-code/k3";
  if (ids.includes("k3")) return "k3";
  return ids.find((id) => /k3/i.test(id) && !/256k|k2/i.test(id)) ?? null;
}
```

- [ ] **Step 4: Run tests**

Run: `npx vitest run src/lib/memory-founding-model.test.ts`
Expected: PASS

- [ ] **Step 5: Commit**

```bash
git add src/lib/memory-founding-model.ts src/lib/memory-founding-model.test.ts
git commit -m "feat: pick Kimi K3 1M for founding dreams"
```

---

### Task 2: TeachExtract

**Files:**
- Create: `src/lib/memory-teach.ts`
- Create: `src/lib/memory-teach.test.ts`

**Interfaces:**
- Consumes: `IngestTurn` from `memory-ingest.ts` (user/assistant/tool)
- Produces:
  - `export function stripInjectedMemory(text: string): string`
  - `export function extractTeachLines(turns: readonly IngestTurn[], forgotten?: readonly string[]): DailyLine[]`
  - Kinds written: `teach_episode` | `user_pref` only (no raw unsignaled utterances)

- [ ] **Step 1: Write the failing tests**

```ts
import { describe, expect, it } from "vitest";
import { extractTeachLines, stripInjectedMemory } from "./memory-teach";
import type { IngestTurn } from "./memory-ingest";

const base = { agentId: "grok" as const, sessionId: "s1", cwd: "/p" };

describe("stripInjectedMemory", () => {
  it("drops a closed user-memory block and keeps the real request", () => {
    const text = `<user-memory>\n# You\n- 继续 Source: grok · s0\n</user-memory>\n\n都动`;
    expect(stripInjectedMemory(text)).toBe("都动");
  });

  it("drops an unclosed user-memory prefix of # You bullets", () => {
    const text = `<user-memory>\n# You\n- 清日历 Source: grok · s0\n请改合同`;
    expect(stripInjectedMemory(text)).toContain("请改合同");
    expect(stripInjectedMemory(text)).not.toContain("清日历");
  });
});

describe("extractTeachLines", () => {
  it("pairs a correction with the previous assistant turn as teach_episode", () => {
    const turns: IngestTurn[] = [
      { ...base, role: "assistant", text: "保录服务，总价 32 万。" },
      { ...base, role: "user", text: "「保录」必须改成「院校录取结果兜底服务」，报价不能加总。" },
    ];
    const lines = extractTeachLines(turns);
    expect(lines).toHaveLength(1);
    expect(lines[0]?.kind).toBe("teach_episode");
    expect(lines[0]?.text).toMatch(/兜底/);
  });

  it("treats 都动 and 继续 as user_pref", () => {
    const lines = extractTeachLines([
      { ...base, role: "user", text: "都动" },
      { ...base, sessionId: "s2", role: "user", text: "继续" },
    ]);
    expect(lines.map((l) => l.kind)).toEqual(["user_pref", "user_pref"]);
  });

  it("drops tools, secrets, forgotten ids, and unsignaled chatter", () => {
    const lines = extractTeachLines(
      [
        { ...base, role: "tool", text: "bash" },
        { ...base, role: "user", text: "hello there today" },
        { ...base, role: "user", text: "sk-abc" },
        { ...base, sessionId: "gone", role: "user", text: "以后用 pnpm" },
      ],
      ["gone"],
    );
    expect(lines).toEqual([]);
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx vitest run src/lib/memory-teach.test.ts`
Expected: FAIL on missing module.

- [ ] **Step 3: Implement**

`stripInjectedMemory`: remove `<user-memory>…</user-memory>`; if an unclosed `<user-memory>` prefix remains, drop `# You` and following `- ` bullets, keep the rest.

`extractTeachLines`: skip tool/subagent/forgotten/`looksLikeSecret`/`isHarnessUserText`. Strip memory echo on user text. If the user text matches correction signals (`不要|别再|改成|不是|你录错|先.+再|以后|总是|按这个|记住|always|never|don't|do not|instead`) and a previous assistant text exists in the same session, emit `teach_episode` with clipped `was: … → now: …` (assistant ≤200 chars, user ≤400). Else if text is `继续` / `都动` or `hasMemorySignal`, emit `user_pref`. Else drop.

- [ ] **Step 4: Run tests**

Run: `npx vitest run src/lib/memory-teach.test.ts`
Expected: PASS

- [ ] **Step 5: Commit**

```bash
git add src/lib/memory-teach.ts src/lib/memory-teach.test.ts
git commit -m "feat: extract teaching episodes from correction turns"
```

---

### Task 3: Daily kinds and ingest staging

**Files:**
- Modify: `src/lib/memory-ingest.ts`
- Modify: `src/lib/memory-ingest.test.ts`
- Modify: `src/lib/memory-grok-turns.ts`
- Modify: `src/lib/memory-grok-turns.test.ts`

**Interfaces:**
- Consumes: `extractTeachLines`
- Produces: `IngestKind` includes `"teach_episode"`. `applyGrokIngest` stages extract output, not raw user utterances. `skipFoundingSession(session, memoryRoot)`.

- [ ] **Step 1: Write the failing tests**

In `memory-ingest.test.ts` add:

```ts
it("round-trips teach_episode lines", () => {
  const lines = [{ agentId: "grok" as const, sessionId: "s1", cwd: "/p", kind: "teach_episode" as const, text: "was: A → now: B" }];
  expect(parseDailyFile(formatDailyFile("2026-09-09", lines))).toEqual(lines);
});
```

In `memory-grok-turns.test.ts` add (keep existing skipDreamIngestPage tests):

```ts
it("skipFoundingSession drops observer, subagent, and memory-root sessions", () => {
  expect(skipFoundingSession({ id: "a", cwd: "/p", dir: "/Users/me/.claude/projects/-Users-me--claude-mem-observer-sessions/a.jsonl" }, "/mem")).toBe(true);
  expect(skipFoundingSession({ id: "b", cwd: "/p", sessionKind: "subagent" }, "/mem")).toBe(true);
  expect(skipFoundingSession({ id: "c", cwd: "/p", parentSessionId: "parent" }, "/mem")).toBe(true);
  expect(skipFoundingSession({ id: "d", cwd: "/p", dir: "/Users/me/.claude/projects/-Users-me-Documents-GlobalEdu/d.jsonl" }, "/mem")).toBe(false);
});
```

Change `applyGrokIngest` tests that expected raw user lines: a user_message_chunk `"以后先出框架"` should become `user_pref` or `teach_episode`; `"hello"` should not fill a shard.

- [ ] **Step 2: Run tests to verify they fail**

Run: `npx vitest run src/lib/memory-ingest.test.ts src/lib/memory-grok-turns.test.ts`
Expected: FAIL on `teach_episode` parse and missing `skipFoundingSession`.

- [ ] **Step 3: Implement**

- Extend `IngestKind` and `parseDailyFile` allowed kinds with `teach_episode`.
- `applyGrokIngest`: `extractTeachLines(grokTurnsFromUpdates(...), forgotten)` then format those lines into shards (existing 64 KiB filler).
- `skipFoundingSession`: true if `skipDreamIngestPage`, or `sessionKind === "subagent"`, or `parentSessionId` set, or `cwd`/`dir` matches `/claude-mem-observer/i`.

- [ ] **Step 4: Run tests**

Run: `npx vitest run src/lib/memory-ingest.test.ts src/lib/memory-grok-turns.test.ts`
Expected: PASS (update any fixtures that assumed unsignaled utterances are staged).

- [ ] **Step 5: Commit**

```bash
git add src/lib/memory-ingest.ts src/lib/memory-ingest.test.ts src/lib/memory-grok-turns.ts src/lib/memory-grok-turns.test.ts
git commit -m "feat: stage teach episodes instead of raw utterances"
```

---

### Task 4: Nightly prompt and skill stubs

**Files:**
- Modify: `src/lib/memory-phase-prompt.ts`
- Modify: `src/lib/memory-phase-prompt.test.ts`

**Interfaces:**
- Consumes: `DreamIo`, selected tagged lines, optional `skillNames: readonly string[]`
- Produces:
  - `MAIN_OUTPUT_MARKERS` includes `SKILLS`
  - `mainPrompt(io, selected, skillNames?: readonly string[]): string`
  - `parseMainOutput` returns `skills: SkillStub[]`
  - `export type SkillStub = { action: "create" | "patch" | "noop"; id: string; title: string; target: string; evidence: string; summary: string }`
  - `export function parseSkillStubs(block: string): SkillStub[]`

- [ ] **Step 1: Write the failing tests**

```ts
it("asks for a teaching diary, SKILLS, and lists skill names", () => {
  const text = mainPrompt(io, ["- [grok | s1 | /p | teach_episode] 先框架再 PDF"], ["beldore-pdf"]);
  expect(text).toMatch(/<<<SKILLS>>>/);
  expect(text).toMatch(/teaching/i);
  expect(text).toMatch(/beldore-pdf/);
  expect(text).not.toMatch(/2-4 sentences/);
});

it("parses SKILLS yaml blocks and ignores a broken stub", () => {
  const parsed = parseMainOutput(`<<<DIARY>>>\n## 2026-09-09\n你改了口径。\n<<<SKILLS>>>\naction: create\nid: scheme-pdf\ntitle: 升学方案\ntarget:\nevidence: s1\nsummary: 先框架再 PDF\n---\nnot-yaml\n<<<TAGLINE>>>\n懂你的工作台\n`);
  expect(parsed.skills).toEqual([
    { action: "create", id: "scheme-pdf", title: "升学方案", target: "", evidence: "s1", summary: "先框架再 PDF" },
  ]);
  expect(parsed.diary).toContain("口径");
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx vitest run src/lib/memory-phase-prompt.test.ts`
Expected: FAIL on `<<<SKILLS>>>` / `parsed.skills`.

- [ ] **Step 3: Implement**

Rewrite diary instructions (Chinese+English in the prompt): 3–6 short paragraphs, second person, one concrete teaching scene when `teach_episode` is present; no session inventory; no restating USER.md; empty selection → one sentence that no new teaching landed.

Add `<<<SKILLS>>>` as marker 3, TAGLINE as 4. `parseMainOutput` uses `<<<(DIARY|USER|SKILLS|TAGLINE)>>>`. `parseSkillStubs` splits on `/^---$/m`, reads `action/id/title/target/evidence/summary` lines; drop blocks with missing `id` or invalid `action`.

Pass `skillNames` into the prompt as a comma-separated catalog (names only). Default `[]`.

- [ ] **Step 4: Run tests**

Run: `npx vitest run src/lib/memory-phase-prompt.test.ts`
Expected: PASS

- [ ] **Step 5: Commit**

```bash
git add src/lib/memory-phase-prompt.ts src/lib/memory-phase-prompt.test.ts
git commit -m "feat: nightly dream prompt writes teaching diary and skill stubs"
```

---

### Task 5: Weight teach_episode

**Files:**
- Modify: `src/lib/memory-weight.ts`
- Modify: `src/lib/memory-weight.test.ts`

**Interfaces:**
- Consumes: `IngestKind` including `teach_episode`
- Produces: `KIND_WEIGHTS.teach_episode = 5` (above `user_pref` 3)

- [ ] **Step 1: Write the failing test**

```ts
it("ranks teach_episode above user_pref", () => {
  const today = "2026-09-09";
  const scored = weightDailyLines(
    [
      line("grok", "s1", "user_pref", "都动"),
      line("grok", "s1", "teach_episode", "was: 保录 → now: 兜底"),
    ],
    today,
    today,
  );
  expect(scored[1].score).toBeGreaterThan(scored[0].score);
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx vitest run src/lib/memory-weight.test.ts`
Expected: FAIL (missing kind or equal weights).

- [ ] **Step 3: Implement** — add `teach_episode: 5` to `KIND_WEIGHTS`.

- [ ] **Step 4: Run tests**

Run: `npx vitest run src/lib/memory-weight.test.ts`
Expected: PASS

- [ ] **Step 5: Commit**

```bash
git add src/lib/memory-weight.ts src/lib/memory-weight.test.ts
git commit -m "feat: rank teaching episodes first in dream selection"
```

---

### Task 6: Founding cluster and one-shot gate

**Files:**
- Create: `src/lib/memory-founding-cluster.ts`
- Create: `src/lib/memory-founding-cluster.test.ts`

**Interfaces:**
- Produces:
  - `export const FOUNDING_ONE_SHOT_CHARS = 400_000`
  - `export const FOUNDING_MAX_DOMAINS = 12`
  - `export function domainKey(cwd: string): string`
  - `export function clusterEpisodes(lines: readonly { cwd: string; text: string }[]): { domain: string; lines: typeof lines }[]`
  - `export function shouldFoundingOneShot(packedChars: number): boolean`

- [ ] **Step 1: Write the failing tests**

```ts
import { describe, expect, it } from "vitest";
import {
  clusterEpisodes,
  domainKey,
  FOUNDING_MAX_DOMAINS,
  FOUNDING_ONE_SHOT_CHARS,
  shouldFoundingOneShot,
} from "./memory-founding-cluster";

describe("domainKey", () => {
  it("strips worktrees and maps known roots", () => {
    expect(domainKey("/Users/foxie/project_development/grok_build_desktop/.worktrees/feat-frost-theme")).toBe("grok_build_desktop");
    expect(domainKey("/Users/foxie/Documents/GlobalEdu/柏铎世家 标准材料")).toBe("GlobalEdu");
    expect(domainKey("/Users/foxie/Library/Mobile Documents/iCloud~md~obsidian/Documents/VaultWorld/40_Finance")).toBe("40_Finance");
  });
});

describe("clusterEpisodes", () => {
  it("collapses extra domains into other until FOUNDING_MAX_DOMAINS", () => {
    const lines = Array.from({ length: 20 }, (_, i) => ({ cwd: `/proj/app${i}`, text: "x" }));
    const groups = clusterEpisodes(lines);
    expect(groups.length).toBeLessThanOrEqual(FOUNDING_MAX_DOMAINS);
    expect(groups.some((g) => g.domain === "other")).toBe(true);
  });
});

describe("shouldFoundingOneShot", () => {
  it("one-shots at the cap and splits above it", () => {
    expect(shouldFoundingOneShot(FOUNDING_ONE_SHOT_CHARS)).toBe(true);
    expect(shouldFoundingOneShot(FOUNDING_ONE_SHOT_CHARS + 1)).toBe(false);
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx vitest run src/lib/memory-founding-cluster.test.ts`
Expected: FAIL on missing module.

- [ ] **Step 3: Implement**

`domainKey`: strip `/.worktrees/[^/]+`; if path includes `GlobalEdu` → `GlobalEdu`; `grok_build_desktop` → that; `Beldore_edu_planner` → that; `HKUST` or `30_Academic` → `30_Academic`; `Writing Projects` or `writing-projects` → `writing-projects`; `40_Finance` → that; `LoveLife` → that; else last non-empty path segment.

`clusterEpisodes`: group by key, sort groups by size descending, if count > 12 merge the smallest into `other`.

`shouldFoundingOneShot`: `packedChars <= FOUNDING_ONE_SHOT_CHARS`.

- [ ] **Step 4: Run tests**

Run: `npx vitest run src/lib/memory-founding-cluster.test.ts`
Expected: PASS

- [ ] **Step 5: Commit**

```bash
git add src/lib/memory-founding-cluster.ts src/lib/memory-founding-cluster.test.ts
git commit -m "feat: cluster founding episodes and gate the K3 one-shot"
```

---

### Task 7: Founding prompts, paths, and state

**Files:**
- Create: `src/lib/memory-founding-prompt.ts`
- Create: `src/lib/memory-founding-prompt.test.ts`
- Modify: `src/lib/memory-paths.ts`
- Modify: `src/lib/memory-paths.test.ts`
- Modify: `src/lib/memory-state.ts` (and existing state tests if any)

**Interfaces:**
- Produces:
  - `foundingPrompt({ episodes, userMd, skillNames, memoryClip, day }): string` — same four markers, heading `## 大梦 · ${day}`, asks for ~800 word teaching chapter, K3/capacity voice
  - `domainPrompt({ domain, episodes, skillNames }): string`
  - `mergePrompt({ domainNotes, userMd, skillNames, memoryClip, day }): string`
  - `foundingEpisodePath(root, index)` → `.dreams/founding/_episodes.N.md` (N 1–8)
  - `foundingDomainPath(root, domain)`
  - `skillProposalPath(root, id)`
  - MemoryState fields: `foundingAt`, `foundingStatus` (`idle|running|ok|failed`), `foundingError`, `foundingDomainsDone: string[]`, `foundingCursors: Record<string, number>`, `foundingModelId: string | null`
  - `emptyMemoryState` / `parseMemoryState` round-trip those fields (unknown keys ignored)

- [ ] **Step 1: Write the failing tests** for prompt markers `## 大梦`, paths, and `parseMemoryState({ foundingAt: 1, foundingStatus: "ok", foundingModelId: "kimi-code/k3" })`.

- [ ] **Step 2: Run** `npx vitest run src/lib/memory-founding-prompt.test.ts src/lib/memory-paths.test.ts src/lib/memory-state.ts` (use the existing state test file if present: glob `memory-state.test.ts`)

- [ ] **Step 3: Implement** paths with the same 1–8 shard throw as daily. State parse: `foundingStatus` only accepts the four strings; arrays/objects default empty.

- [ ] **Step 4: Run tests — PASS**

- [ ] **Step 5: Commit** `feat: founding prompts, paths, and state fields`

---

### Task 8: Skill proposal store

**Files:**
- Create: `src/lib/memory-skill-proposal.ts`
- Create: `src/lib/memory-skill-proposal.test.ts`

**Interfaces:**
- Consumes: `SkillStub`
- Produces:
  - `export type SkillProposal = SkillStub & { status: "pending" | "approved" | "dismissed"; source: "founding" | "nightly" }`
  - `export function proposalMarkdown(p: SkillProposal): string` — YAML front matter + summary body
  - `export function parseProposalMarkdown(text: string): SkillProposal | null`
  - `export function applyProposalDecision(p: SkillProposal, decision: "approved" | "dismissed"): SkillProposal`
  - `export function skillMarkdownFromProposal(p: SkillProposal): string` — `# title` + summary; used only when approved
  - `noop` stubs: `proposalMarkdown` returns `null` / callers skip files

- [ ] **Step 1: Failing tests** for round-trip pending, dismiss keeps disk skills unchanged (pure function), approve produces SKILL.md body containing title+summary, noop returns null.

- [ ] **Step 2: Run** `npx vitest run src/lib/memory-skill-proposal.test.ts` — FAIL

- [ ] **Step 3: Implement** front matter keys `action,id,title,target,status,evidence,source` plus markdown body = summary.

- [ ] **Step 4: PASS**

- [ ] **Step 5: Commit** `feat: queue skill proposals for human approval`

---

### Task 9: Founding ACP session helpers

**Files:**
- Modify: `src/lib/memory-dream-acp.ts`
- Create or modify: `src/lib/memory-dream-acp.test.ts` (if none, create)

**Interfaces:**
- Consumes: `pickFoundingKimiModel`
- Produces:
  - `export const NIGHTLY_PROMPT_TIMEOUT_MS = 10 * 60 * 1000`
  - `export const FOUNDING_PROMPT_TIMEOUT_MS = 45 * 60 * 1000`
  - `openDreamAcp(opts)` gains `promptTimeoutMs?: number` (default nightly)
  - `export function foundingBootstrapPrompts(modelId: string): string[]` → `["/model ${modelId}", "/effort max"]`
  - After `session/new`, founding caller sends those two slashes via `prompt()` **before** the big founding prompt (empty-buffer each time; ignore model chatter in parse)

Do **not** set `alreadyRunning` to skip `session/new`. Always a new session. Do not prompt the live chat thread.

- [ ] **Step 1: Test** `foundingBootstrapPrompts("kimi-code/k3")` equals those two strings; timeout constants.

- [ ] **Step 2–5:** implement, test, commit `feat: founding ACP uses K3 1M with a 45-minute prompt timeout`

---

### Task 10: Wire nightly Claude ingest and founding job

**Files:**
- Modify: `src/hooks/useDreamJob.ts`
- Modify: `src/hooks/useDreamJob.test.ts`

**Interfaces:**
- `collectIngestPages` includes `agentId === "grok" || agentId === "claude"`, uses `readSessionUpdates(s.id, after, s.dir)` (pass `dir` so Claude jsonl replay works), skips `skipFoundingSession`.
- Nightly `mainPrompt` gets skill names from `inspect_brief` if already invoked in the app; if that is awkward in the hook, pass `[]` for nightly catalog in this task and fill names in Task 11. Prefer: add optional `skillNames: string[]` on `DreamJobOpts` from App later.
- `runFounding()`:
  1. refuse if lock / running
  2. require kimi `authPresent` else status error copy
  3. `pickFoundingKimiModel` on catalog ids passed via opts `kimiModelIds: string[]` — `null` → fail copy
  4. extract pages with **foundingCursors** (not nightly cursors), `extractTeachLines`, persist episode shards via existing `writeMemoryHost` / `readTextFile` (64 KiB each, max 8, highest-weight if overflow)
  5. if `shouldFoundingOneShot(packed.length)` → one `foundingPrompt` on kimi ACP with bootstrap slashes and 45 min timeout
  6. else cluster → domain prompts → merge
  7. `parseMainOutput`; first founding (`foundingAt == null`) may replace USER (existing USER validators still apply: 8 KiB, Source on new lines). Later founding keep-on-conflict: if new USER drops >20% of prior bullets, restore preimage (reuse existing dream validators if present; if not, keep prior USER on any missing old bullet count >20%).
  8. append diary only if `utf8Bytes(dreamsMd) ≤ 64 KiB`
  9. write non-noop stubs as pending proposals
  10. set `foundingAt`, `foundingStatus: "ok"`, `foundingModelId`
- `onFoundingNow` exported next to `onDreamNow`.
- Overlay status: founding running uses a distinct kind or `lastError` empty + `foundingStatus: running` so UI can say 正在做大梦.

- [ ] **Step 1:** Extend `useDreamJob.test.ts` source-contract tests (the file already asserts `selectDreamInput` appears). Add: `collectIngestPages` / `agentId === "claude"` / `runFounding` / `pickFoundingKimiModel` / `FOUNDING_PROMPT_TIMEOUT_MS` present; `collectGrokPages` filter `!== "grok"` gone.

- [ ] **Step 2:** FAIL then implement. Keep nightly backfill loop unchanged except page collector rename.

- [ ] **Step 3–5:** tests PASS, commit `feat: run founding dreams on Kimi K3 and ingest Claude`

`readSessionUpdates` signature in `src/api.ts` already takes optional `dir`. Use it.

---

### Task 11: Growth UI, i18n, proposals, E2E

**Files:**
- Modify: `src/components/memory-growth/MemoryGrowthPage.tsx`
- Modify: `src/components/memory-growth/GrowthHeader.tsx` if the menu is only there
- Modify: `src/lib/i18n.ts` (ZH and EN together)
- Modify: `src/lib/i18n.test.ts` — one assertion for the new 大梦 string; key-parity already covers the rest
- Modify: `src/App.tsx` / `src/hooks/pack-app-model.ts` to pass `onFoundingNow`, pending proposals, kimi catalog ids
- Modify: `e2e/memory-growth.spec.ts`

**Copy (exact):**

| key | zh | en |
|---|---|---|
| `memory.growth.foundingNow` | 做一场大梦 | Founding dream |
| `memory.growth.foundingAgain` | 再做一场大梦（合并，不覆盖手改） | Dream again (merge, keep edits) |
| `memory.statusFounding` | 正在做大梦 | Founding dream running |
| `memory.foundingNeedKimi` | 大梦失败：Kimi 未登录 | Founding failed: Kimi is signed out |
| `memory.foundingNeedK3` | 大梦失败：需要 Kimi K3 1M，未找到 k3（拒绝 k3-256k） | Founding failed: need Kimi K3 1M (not k3-256k) |
| `memory.growth.proposalApprove` | 批准 | Approve |
| `memory.growth.proposalDismiss` | 驳回 | Dismiss |

Pending proposals: list title + evidence; 批准 calls a hook that writes `~/.grok/skills/<id>/SKILL.md` via existing `write_text_file` if that command exists — otherwise `writeMemoryHost` cannot escape memory root. Check `src/api.ts` for `writeTextFile` / `write_text_file`. If none, add a Tauri command only if required; prefer an existing generic write used by MemoryWorkspace. If the only write is memory-host-capped, document in the task report and write the SKILL.md with `write_text_file` already used by the editor.

- [ ] **Step 1:** i18n parity test still passes after adding keys. E2E: open growth menu, expect 做一场大梦; with `foundingAt` set in host stub, expect 再做一场大梦.

- [ ] **Step 2–5:** implement, `npx vitest run src/lib/i18n.test.ts`, `CI=1 npx playwright test e2e/memory-growth.spec.ts`, commit `feat: growth page founding dream and skill approval`

---

### Task 12: Spec status + focused regression

**Files:** spec status line only; no product code unless tests fail.

- [ ] Mark `docs/superpowers/specs/2026-09-09-capability-dreaming-and-founding-design.md` Status: `approved`.
- [ ] Run: `npx vitest run src/lib/memory-founding-model.test.ts src/lib/memory-teach.test.ts src/lib/memory-ingest.test.ts src/lib/memory-grok-turns.test.ts src/lib/memory-phase-prompt.test.ts src/lib/memory-weight.test.ts src/lib/memory-founding-cluster.test.ts src/lib/memory-founding-prompt.test.ts src/lib/memory-paths.test.ts src/lib/memory-skill-proposal.test.ts src/hooks/useDreamJob.test.ts src/lib/i18n.test.ts`
- [ ] Commit `docs: approve capability dreaming spec` if the status line is the only doc change.

## Spec coverage

| Spec requirement | Task |
|---|---|
| Warm teaching diary | 4 |
| Skill proposal queue + approve | 8, 11 |
| Founding ≠ nightly; no cursor rewind | 10 |
| Grok + Claude corpus; skip observer/subagent | 3, 10 |
| Kimi K3 1M runner, no 256k, no Grok fallback | 1, 9, 10 |
| Local extract; 64 KiB shards; one-shot 400k | 2, 3, 6, 7, 10 |
| Nightly keep-on-conflict; first founding replace | 10 |
| Nightly 40/6000 + teach weight | 5 |
| UI 大梦 + 批准/驳回 | 11 |

## Execution notes

Do not start a live K3 founding in tests. Do not log or copy `~/.kimi-code/config.toml` secrets. `dir` on `readSessionUpdates` is required for Claude.
