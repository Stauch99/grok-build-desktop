# Multi-Agent Usage Brand Switcher Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Usage overlay filters token turns by CLI brand (`全部 | Grok | Kimi | Claude | Codex`) and subscription quota billing is polled only when `authKind === "subscription"`.

**Architecture:** Wave 1 already added `TokenTurn.agentId` and `filterTurns` brand filter. `UsageStats.asTurns` currently drops `agentId`. `useAppModel` always polls `_x.ai/billing`. This wave wires those without spawning other CLIs.

**Tech Stack:** TypeScript + Vitest. No new dependencies.

## Global Constraints

- Spec: brand switcher `全部 | Grok | Kimi | Claude | Codex`; missing `agentId` counts as grok.
- Quota/billing poll only when `shouldShowUsageRing(authKind)` is true. API key wins (`classifyAuthKind`).
- Context-window `UsageRing` (thread fill) is **not** the subscription quota ring; do not hide it.
- Dirty files: isolate. Never `git add -A`. TDD.

---

### Task 1: Brand options and row mapping

**Files:**
- Modify: `src/lib/token-usage.ts`
- Modify: `src/lib/token-usage.test.ts`

**Interfaces:**
- `export type UsageBrandFilter = AgentId | "all"`
- `export const USAGE_BRAND_OPTIONS: { value: UsageBrandFilter; label: string }[]` =
  `[{ value: "all", label: "全部" }, { value: "grok", label: "Grok" }, { value: "kimi", label: "Kimi" }, { value: "claude", label: "Claude" }, { value: "codex", label: "Codex" }]`
- `export function mapTokenTurnRow(row: { at?: unknown; cwd?: unknown; model?: unknown; input?: unknown; output?: unknown; cacheRead?: unknown; cacheCreate?: unknown; total?: unknown; modelCalls?: unknown; costTicks?: unknown; agentId?: unknown }): TokenTurn` — numeric fields like UsageStats.asTurns today; if `agentId` is a valid AgentId, copy it; otherwise omit (legacy → grok via filterTurns)

- [ ] **Step 1: Failing tests** (append)

```ts
import { isAgentId } from "./agent-id";
import { mapTokenTurnRow, USAGE_BRAND_OPTIONS } from "./token-usage";

describe("USAGE_BRAND_OPTIONS", () => {
  it("lists 全部 then the four CLIs", () => {
    expect(USAGE_BRAND_OPTIONS.map((o) => o.value)).toEqual(["all", "grok", "kimi", "claude", "codex"]);
    expect(USAGE_BRAND_OPTIONS[0]?.label).toBe("全部");
  });
});

describe("mapTokenTurnRow", () => {
  it("keeps a valid agentId and drops junk", () => {
    expect(mapTokenTurnRow({ total: 9, agentId: "claude" }).agentId).toBe("claude");
    expect(mapTokenTurnRow({ total: 9, agentId: "gemini" }).agentId).toBeUndefined();
    expect(isAgentId("claude")).toBe(true);
  });
});
```

- [ ] **Step 2:** `npm test -- src/lib/token-usage.test.ts` FAIL then implement.

```ts
import { isAgentId, type AgentId } from "./agent-id";

export type UsageBrandFilter = AgentId | "all";

export const USAGE_BRAND_OPTIONS: { value: UsageBrandFilter; label: string }[] = [
  { value: "all", label: "全部" },
  { value: "grok", label: "Grok" },
  { value: "kimi", label: "Kimi" },
  { value: "claude", label: "Claude" },
  { value: "codex", label: "Codex" },
];

export function mapTokenTurnRow(row: {
  at?: unknown;
  cwd?: unknown;
  model?: unknown;
  input?: unknown;
  output?: unknown;
  cacheRead?: unknown;
  cacheCreate?: unknown;
  total?: unknown;
  modelCalls?: unknown;
  costTicks?: unknown;
  agentId?: unknown;
}): TokenTurn {
  const agentId = typeof row.agentId === "string" && isAgentId(row.agentId) ? row.agentId : undefined;
  return {
    at: Number(row.at) || 0,
    cwd: typeof row.cwd === "string" ? row.cwd : "",
    model: typeof row.model === "string" ? row.model : "",
    input: Number(row.input) || 0,
    output: Number(row.output) || 0,
    cacheRead: Number(row.cacheRead) || 0,
    cacheCreate: Number(row.cacheCreate) || 0,
    total: Number(row.total) || 0,
    modelCalls: Number(row.modelCalls) || 0,
    costTicks: Number(row.costTicks) || 0,
    ...(agentId ? { agentId } : {}),
  };
}
```

- [ ] **Step 3:** tests PASS. Commit only token-usage files.

```
feat: map token turns with CLI brand for the usage overlay
```

---

### Task 2: UsageStats brand switcher

**Files:**
- Modify: `src/components/UsageStats.tsx`

**Interfaces:**
- Replace local `asTurns` with `mapTokenTurnRow`
- State `brand: UsageBrandFilter` default `"all"`
- `filter.agentId = brand`
- Toolbar MenuSelect first control: ariaLabel `CLI`, options from `USAGE_BRAND_OPTIONS`
- Kicker: if brand is `all` keep `Grok Build · 真实消耗 Tokens` for now; if a specific brand, `{label} · 真实消耗 Tokens`

Isolation if UsageStats.tsx is dirty.

- [ ] **Step 1:** No component test file exists. Add `src/components/UsageStats.test.ts` that imports `USAGE_BRAND_OPTIONS` and a tiny helper exported from UsageStats? Prefer not exporting from the component. Test filter composition in token-usage (already done). For this task, after wiring, grep UsageStats for `USAGE_BRAND_OPTIONS` and `mapTokenTurnRow`.

- [ ] **Step 2:** Implement the MenuSelect + mapTokenTurnRow.

- [ ] **Step 3:** `npm test -- src/lib/token-usage.test.ts` PASS.

- [ ] **Step 4:** Commit only UsageStats.tsx.

```
feat: filter usage overlay turns by CLI brand
```

---

### Task 3: Gate Grok billing poll on subscription auth

**Files:**
- Modify: `src/lib/auth-kind.ts` — already has `shouldShowUsageRing`. Add:
  `export function shouldPollBilling(kind: AuthKind): boolean { return shouldShowUsageRing(kind); }`
- Modify: `src/lib/auth-kind.test.ts`
- Modify: `src/hooks/useAppModel.ts` — skip `_x.ai/billing` when `shouldPollBilling` is false.

Until per-agent doctor exists, derive kind from existing doctor + inspect: if API key evidence exists, kind is `api`. Look for `inspect` / `auth_present` already in useAppModel. If you cannot find a reliable API-key signal without new doctor fields, gate on: do not add new network; only skip poll when a boolean `hasApiKey` you can already read is true. If no signal exists, export `shouldPollBilling` tested, and in useAppModel call it with `classifyAuthKind({ hasSubscriptionSession: doctor.authPresent, hasApiKey: false })` so subscription Grok still polls (today's behavior). Document that API-key detection lands with the doctor wave.

- [ ] **Step 1:** test `shouldPollBilling` equals `shouldShowUsageRing`.

- [ ] **Step 2:** implement alias + useAppModel early return in `refreshBillingRef` when `!shouldPollBilling(kind)`.

- [ ] **Step 3:** commit owned files (isolation on useAppModel).

```
feat: poll subscription billing only when the usage ring is allowed
```

---
