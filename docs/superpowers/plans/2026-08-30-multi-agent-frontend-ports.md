# Multi-Agent Frontend Ports and Settings Doctors Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** UI talks to AgentPort / workbench invokes — `doctorAll`, marketplace skill install, session `agentId` stamp, Settings 总览 lists four doctors, billing polls only when the selected doctor is `subscription`.

**Architecture:** Spec `docs/superpowers/specs/2026-08-30-multi-agent-acp-workbench-design.md`. Rust already has `doctor_all`, `install_marketplace_skill`, `SessionSummary.agent_id`, `start_agent(agentId)`. This wave is TS facades + surgical dirty-file isolation.

**Tech Stack:** TypeScript + Vitest. No new deps.

## Global Constraints

- AgentId closed enum. API key wins. Usage ring only if `authKind === "subscription"`.
- Do not spawn CLIs. Do not implement plugins/imagine.
- Isolation: never `git add -A`. Prefer new files. Dirty: `api.ts`, `useAppModel.ts`, `Settings.tsx`, `ExtensionsHub.tsx`.
- TDD.

## Follow-on

- Composer selectedAgentId chip
- Native Kimi/Claude/Codex session scanners
- Phase 0 ACP probes

---

### Task 1: workbench invoke wrappers

**Files:**
- Create: `src/lib/workbench-api.ts`
- Create: `src/lib/workbench-api.test.ts`

**Interfaces:**
- `export async function doctorAll(): Promise<import("./agent-doctor").AgentDoctor[]>` — `invoke("doctor_all")`
- `export async function installMarketplaceSkill(source: string): Promise<string>` — `invoke("install_marketplace_skill", { source })`

Tests mock invoke:

```ts
import { beforeEach, describe, expect, it, vi } from "vitest";

const invoke = vi.fn();
vi.mock("@tauri-apps/api/core", () => ({ invoke: (...a: unknown[]) => invoke(...a) }));

describe("workbench-api", () => {
  beforeEach(() => invoke.mockReset());
  it("calls doctor_all and install_marketplace_skill", async () => {
    const { doctorAll, installMarketplaceSkill } = await import("./workbench-api");
    invoke.mockResolvedValueOnce([{ agentId: "grok", authKind: "none" }]);
    await expect(doctorAll()).resolves.toEqual([{ agentId: "grok", authKind: "none" }]);
    expect(invoke).toHaveBeenCalledWith("doctor_all");
    invoke.mockResolvedValueOnce("/tmp/.agents/skills/pdf");
    await expect(installMarketplaceSkill("/tmp/pdf")).resolves.toBe("/tmp/.agents/skills/pdf");
    expect(invoke).toHaveBeenCalledWith("install_marketplace_skill", { source: "/tmp/pdf" });
  });
});
```

- [ ] **Step 1–5:** TDD, commit only those two files.

```
feat: invoke doctor_all and marketplace skill install
```

---

### Task 2: AgentPort facade + billing kind from doctors

**Files:**
- Create: `src/lib/agent-port.ts`
- Create: `src/lib/agent-port.test.ts`

**Interfaces:**
- Consumes `startAgent`, `stopAgent`, `sendRaw` from `../api` and `AuthKind` / `AgentDoctor` / `AgentId`
- `export type AgentPort = { id: AgentId; start: () => Promise<void>; stop: () => Promise<void>; send: (payload: unknown) => Promise<unknown> }`
- `export function portFor(id: AgentId): AgentPort` — `start: () => startAgent(id)`, `stop: () => stopAgent(id)`, `send: (p) => sendRaw(p as never, id)`
- `export function billingKindFromDoctors(doctors: Pick<AgentDoctor, "agentId" | "authKind">[], selected: AgentId): AuthKind` — find matching doctor, else `"none"`
- `export function doctorOverviewLine(d: Pick<AgentDoctor, "agentId" | "authKind">): string` — `none` → `{id} · 未登录`; `api` → `{id} · API`; `subscription` → `{id} · 已登录`

Mock `../api` in tests so we do not boot Tauri.

```ts
import { describe, expect, it, vi } from "vitest";

const startAgent = vi.fn(async () => {});
const stopAgent = vi.fn(async () => {});
const sendRaw = vi.fn(async () => ({}));
vi.mock("../api", () => ({ startAgent, stopAgent, sendRaw }));

import { billingKindFromDoctors, doctorOverviewLine, portFor } from "./agent-port";

describe("agent-port", () => {
  it("binds start/stop/send to one AgentId", async () => {
    const p = portFor("claude");
    expect(p.id).toBe("claude");
    await p.start();
    await p.stop();
    await p.send({ method: "initialize" });
    expect(startAgent).toHaveBeenCalledWith("claude");
    expect(stopAgent).toHaveBeenCalledWith("claude");
    expect(sendRaw).toHaveBeenCalledWith({ method: "initialize" }, "claude");
  });

  it("picks billing kind and overview copy", () => {
    const docs = [
      { agentId: "grok" as const, authKind: "subscription" as const },
      { agentId: "claude" as const, authKind: "api" as const },
    ];
    expect(billingKindFromDoctors(docs, "grok")).toBe("subscription");
    expect(billingKindFromDoctors(docs, "claude")).toBe("api");
    expect(billingKindFromDoctors(docs, "kimi")).toBe("none");
    expect(doctorOverviewLine(docs[0]!)).toBe("grok · 已登录");
    expect(doctorOverviewLine(docs[1]!)).toBe("claude · API");
    expect(doctorOverviewLine({ agentId: "kimi", authKind: "none" })).toBe("kimi · 未登录");
  });
});
```

- [ ] **Step 1–5:** TDD, commit two new files.

```
feat: bind AgentPort and doctor overview lines
```

---

### Task 3: Stamp listed sessions in a mapper

**Files:**
- Create: `src/lib/session-list.ts`
- Create: `src/lib/session-list.test.ts`

**Interfaces:**
- Consumes `stampSessionAgent` from `./session-agent` and `unionSessions` / `grokSessionsFromRows` from `./admin-port`
- `export function brandSessionList<T extends { id: string; agentId?: string | null }>(rows: T[]): Array<T & { agentId: import("./agent-id").AgentId }>` — map `stampSessionAgent`

```ts
import { describe, expect, it } from "vitest";
import { brandSessionList } from "./session-list";

describe("brandSessionList", () => {
  it("stamps grok on bare rows", () => {
    expect(brandSessionList([{ id: "s1" }, { id: "s2", agentId: "claude" }]).map((s) => s.agentId)).toEqual([
      "grok",
      "claude",
    ]);
  });
});
```

- [ ] **Step 1–5:** commit two new files.

```
feat: brand session lists with agentId
```

---

### Task 4: Isolation — api.ts SessionSummary.agentId + wrappers re-export

**Files:**
- Modify: `src/api.ts` only via isolation dance

Add to `SessionSummary`:
```
  agentId?: string | null;
```

Add at bottom (or near other invokes):
```
export { doctorAll, installMarketplaceSkill } from "./lib/workbench-api";
```

Dance: stash dirty api.ts, checkout HEAD, add the two edits, commit only api.ts, restore dirty, re-apply the two edits.

```
feat: expose session agentId and workbench invokes on api
```

---

### Task 5: Isolation — useAppModel billing from doctors

**Files:**
- Modify: `src/hooks/useAppModel.ts` via isolation

Replace `hasApiKey: false` block with:
```
const selected = "grok"; // until composer chip; grok is the billing subject today
const kind = billingKindFromDoctors(
  doctorsRef.current ?? [],
  selected,
);
```

OR simpler, still using `info` but also `doctors`:

On boot next to `doctor()`, also `doctorAll().then(setDoctors)`. Add `const [doctors, setDoctors] = useState<AgentDoctor[]>([]);`

Then:
```
const kind = billingKindFromDoctors(doctors, "grok");
if (!shouldPollBilling(kind)) return;
```

Need `doctors` in the refreshBilling closure — store in a ref updated each render like other refs in this hook.

Also map `list_sessions` results through `brandSessionList` where sessions are set.

Isolation dance. If the file is too tangled, only change the billing `hasApiKey: false` to:

```
hasApiKey: doctors.some((d) => d.agentId === "grok" && d.authKind === "api"),
hasSubscriptionSession: doctors.some((d) => d.agentId === "grok" && (d.authKind === "subscription" || d.authPresent)),
```

Wait — if authKind is api, hasSubscriptionSession may still be true; classifyAuthKind already lets key win. Prefer `billingKindFromDoctors`.

Load doctors on the existing boot effect that calls `doctor()`.

```
feat: poll billing only for subscription doctors
```

---

### Task 6: Isolation — Settings 总览 four doctors

**Files:**
- Create: `src/components/DoctorsOverview.tsx` (new, no isolation)
- Modify: `src/Settings.tsx` via isolation to render `<DoctorsOverview doctors={doctors} />` on the overview tab

`DoctorsOverview`:
```tsx
import { doctorOverviewLine } from "../lib/agent-port";
import type { AgentDoctor } from "../lib/agent-doctor";

export function DoctorsOverview({ doctors }: { doctors: AgentDoctor[] }) {
  if (!doctors.length) return null;
  return (
    <ul className="set-doctors">
      {doctors.map((d) => (
        <li key={d.agentId}>{doctorOverviewLine(d)}</li>
      ))}
    </ul>
  );
}
```

Settings: add optional `doctors?: AgentDoctor[]` prop; render in overview section near existing doctor info.

Pass `doctors` from App/useAppModel — if App.tsx isolation is too risky, Settings can call `doctorAll()` itself in useEffect.

**Prefer Settings self-fetch** to avoid App.tsx:

```tsx
const [doctors, setDoctors] = useState<AgentDoctor[]>([]);
useEffect(() => { void doctorAll().then(setDoctors).catch(() => setDoctors([])); }, []);
```

Then only Settings.tsx isolation + new DoctorsOverview.tsx committed together if needed. New file can be committed first; Settings isolation second.

```
feat: list all CLI doctors on settings overview
```

---

### Task 7: Isolation — marketplace tab installs a skill folder

**Files:**
- Modify: `src/components/ExtensionsHub.tsx` via isolation

In MarketTab `onInstall`, call `installMarketplaceSkill(installSource)` instead of `grokPluginInstall`.
In `onAdd`, if `marketSource` looks like a local path (starts with `/` or `.`), call `installMarketplaceSkill(marketSource)` instead of `grokMarketplaceAdd`.

Keep git/http sources as follow-on (do not implement zip/github this task).

```
feat: marketplace tab installs local skill folders
```

---
