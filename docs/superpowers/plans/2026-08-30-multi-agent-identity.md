# Multi-Agent Identity, Workbench Home, and Session Brand Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Fill `AgentDoctor.authKind` from per-CLI evidence (API key wins), migrate desktop UI state to `~/.acp-workbench/workbench.json`, stamp sessions with `agentId`, and lock `selectedAgentId` so an existing session cannot switch CLI.

**Architecture:** Spec `docs/superpowers/specs/2026-08-30-multi-agent-acp-workbench-design.md`. Wave foundation already has `classifyAuthKind`, `AgentDoctor`, `SessionRef`. This wave is still pure helpers plus a surgical persist-path change. Full Kimi/Claude/Codex disk session scanners stay a later adapter plan.

**Tech Stack:** TypeScript + Vitest; optional Rust persist path. No new dependencies.

## Global Constraints

- AgentId closed enum. API key wins over subscription.
- Do not spawn CLIs. Do not read `~/.cc-switch`. Do not implement plugins or imagine.
- Pins/drafts/titles migrate bare ids to `grok/<id>` via `sessionRefKey`.
- Changing agent on an **existing** session is forbidden; empty composer may change `selectedAgentId`.
- Dirty-file isolation. `git add` only owned files. Never `git add -A`. TDD.

## Follow-on (do not execute here)

- Native session directory scanners for Kimi/Claude/Codex
- Marketplace zip/GitHub install
- MCP live file writers
- Composer chip UI wiring in App.tsx

---

### Task 1: Per-CLI auth evidence

**Files:**
- Create: `src/lib/agent-auth.ts`
- Create: `src/lib/agent-auth.test.ts`

**Interfaces:**
- Consumes: `AuthEvidence`, `classifyAuthKind`, `AuthKind` from `./auth-kind`; `AgentDoctor`, `emptyDoctor` from `./agent-doctor`; `AgentId`
- Produces:
  - `export function grokAuthEvidence(input: { authJsonExists: boolean; apiKey?: string | null }): AuthEvidence` — `hasSubscriptionSession = authJsonExists`; `hasApiKey = Boolean(apiKey?.trim())`
  - `export function kimiAuthEvidence(input: { loginExists: boolean; apiKey?: string | null }): AuthEvidence` — same shape
  - `export function claudeAuthEvidence(input: { oauthSession: boolean; anthropicApiKey?: string | null }): AuthEvidence`
  - `export function codexAuthEvidence(input: { chatgptLogin: boolean; openaiApiKey?: string | null; codexApiKey?: string | null }): AuthEvidence` — `hasApiKey` if either key is non-empty
  - `export function evidenceForAgent(id: AgentId, input: { subscription: boolean; apiKey?: string | null }): AuthEvidence` — generic wrapper used by tests; grok/kimi/claude use this internally if you prefer one function plus codex extra key
  - `export function doctorFromEvidence(id: AgentId, userHome: string, evidence: AuthEvidence, extra?: { binary?: string | null; version?: string | null; acpSpawnOk?: boolean }): AgentDoctor`

Prefer four named functions as listed (do **not** collapse to only `evidenceForAgent` unless tests still cover each CLI’s key names). `doctorFromEvidence` starts from `emptyDoctor`, sets `authPresent = evidence.hasSubscriptionSession || evidence.hasApiKey`, `authKind = classifyAuthKind(evidence)`, and overlays extra fields.

- [ ] **Step 1: Write the failing test**

```ts
import { describe, expect, it } from "vitest";
import {
  claudeAuthEvidence,
  codexAuthEvidence,
  doctorFromEvidence,
  grokAuthEvidence,
  kimiAuthEvidence,
} from "./agent-auth";

describe("auth evidence", () => {
  it("lets an API key win over a login session", () => {
    expect(grokAuthEvidence({ authJsonExists: true, apiKey: "x" })).toEqual({
      hasSubscriptionSession: true,
      hasApiKey: true,
    });
    expect(kimiAuthEvidence({ loginExists: true, apiKey: "  " })).toEqual({
      hasSubscriptionSession: true,
      hasApiKey: false,
    });
    expect(claudeAuthEvidence({ oauthSession: true, anthropicApiKey: "sk" })).toEqual({
      hasSubscriptionSession: true,
      hasApiKey: true,
    });
    expect(codexAuthEvidence({ chatgptLogin: true, openaiApiKey: null, codexApiKey: "c" })).toEqual({
      hasSubscriptionSession: true,
      hasApiKey: true,
    });
  });
});

describe("doctorFromEvidence", () => {
  it("classifies api when both exist", () => {
    const d = doctorFromEvidence("claude", "/Users/me", {
      hasSubscriptionSession: true,
      hasApiKey: true,
    }, { binary: "/usr/bin/npx", acpSpawnOk: true });
    expect(d.authKind).toBe("api");
    expect(d.authPresent).toBe(true);
    expect(d.home).toBe("/Users/me/.claude");
    expect(d.binary).toBe("/usr/bin/npx");
    expect(d.acpSpawnOk).toBe(true);
  });

  it("is none when empty", () => {
    expect(doctorFromEvidence("grok", "/Users/me", { hasSubscriptionSession: false, hasApiKey: false }).authKind).toBe("none");
  });
});
```

- [ ] **Step 2:** `npm test -- src/lib/agent-auth.test.ts` FAIL (module missing)

- [ ] **Step 3: Implement**

```ts
import type { AgentId } from "./agent-id";
import { classifyAuthKind, type AuthEvidence } from "./auth-kind";
import { emptyDoctor, type AgentDoctor } from "./agent-doctor";

function keyOn(v?: string | null): boolean {
  return Boolean(v?.trim());
}

export function grokAuthEvidence(input: { authJsonExists: boolean; apiKey?: string | null }): AuthEvidence {
  return { hasSubscriptionSession: input.authJsonExists, hasApiKey: keyOn(input.apiKey) };
}

export function kimiAuthEvidence(input: { loginExists: boolean; apiKey?: string | null }): AuthEvidence {
  return { hasSubscriptionSession: input.loginExists, hasApiKey: keyOn(input.apiKey) };
}

export function claudeAuthEvidence(input: { oauthSession: boolean; anthropicApiKey?: string | null }): AuthEvidence {
  return { hasSubscriptionSession: input.oauthSession, hasApiKey: keyOn(input.anthropicApiKey) };
}

export function codexAuthEvidence(input: {
  chatgptLogin: boolean;
  openaiApiKey?: string | null;
  codexApiKey?: string | null;
}): AuthEvidence {
  return {
    hasSubscriptionSession: input.chatgptLogin,
    hasApiKey: keyOn(input.openaiApiKey) || keyOn(input.codexApiKey),
  };
}

export function doctorFromEvidence(
  id: AgentId,
  userHome: string,
  evidence: AuthEvidence,
  extra?: { binary?: string | null; version?: string | null; acpSpawnOk?: boolean },
): AgentDoctor {
  const base = emptyDoctor(id, userHome);
  return {
    ...base,
    authPresent: evidence.hasSubscriptionSession || evidence.hasApiKey,
    authKind: classifyAuthKind(evidence),
    binary: extra?.binary ?? base.binary,
    version: extra?.version ?? base.version,
    acpSpawnOk: extra?.acpSpawnOk ?? base.acpSpawnOk,
  };
}
```

- [ ] **Step 4:** tests PASS

- [ ] **Step 5: Commit** only the two new files.

```
feat: classify per-CLI authKind with API key winning
```

---

### Task 2: Workbench home and session-key migration

**Files:**
- Create: `src/lib/workbench-home.ts`
- Create: `src/lib/workbench-home.test.ts`

**Interfaces:**
- `export function defaultWorkbenchHome(home: string): string` → `{home}/.acp-workbench`
- `export function workbenchJsonPath(wbHome: string): string` → `{wbHome}/workbench.json`
- `export function grokWebuiPath(grokHome: string): string` → `{grokHome}/webui.json`
- `export function shouldMigrateWebui(workbenchExists: boolean, grokWebuiExists: boolean): boolean` — true only when workbench file missing and grok webui exists
- `export function migrateSessionKeyMap<T>(map: Record<string, T>): Record<string, T>` — if a key has no `/`, rewrite to `grok/${key}`; keys that already parse as SessionRef stay; empty keys dropped
- `export function migrateWebuiSessionMaps(state: { pinned?: Record<string, unknown>; titles?: Record<string, unknown>; drafts?: Record<string, unknown>; archived?: Record<string, unknown>; unread?: Record<string, unknown> }): typeof state` — run `migrateSessionKeyMap` on each present map

Use `parseSessionRefKey` / `sessionRefKey` from `./agent-id`.

- [ ] **Step 1: failing tests**

```ts
import { describe, expect, it } from "vitest";
import {
  defaultWorkbenchHome,
  grokWebuiPath,
  migrateSessionKeyMap,
  migrateWebuiSessionMaps,
  shouldMigrateWebui,
  workbenchJsonPath,
} from "./workbench-home";

describe("workbench paths", () => {
  it("lives under ~/.acp-workbench", () => {
    expect(defaultWorkbenchHome("/Users/me/")).toBe("/Users/me/.acp-workbench");
    expect(workbenchJsonPath("/Users/me/.acp-workbench")).toBe("/Users/me/.acp-workbench/workbench.json");
    expect(grokWebuiPath("/Users/me/.grok")).toBe("/Users/me/.grok/webui.json");
  });

  it("migrates only when workbench is missing", () => {
    expect(shouldMigrateWebui(false, true)).toBe(true);
    expect(shouldMigrateWebui(true, true)).toBe(false);
    expect(shouldMigrateWebui(false, false)).toBe(false);
  });
});

describe("migrateSessionKeyMap", () => {
  it("prefixes bare ids as grok and keeps branded keys", () => {
    expect(migrateSessionKeyMap({ abc: 1, "claude/x": 2, "": 3 })).toEqual({
      "grok/abc": 1,
      "claude/x": 2,
    });
  });
});

describe("migrateWebuiSessionMaps", () => {
  it("rewrites pinned and titles", () => {
    const next = migrateWebuiSessionMaps({ pinned: { s1: true }, titles: { s1: "Hi" } });
    expect(next.pinned).toEqual({ "grok/s1": true });
    expect(next.titles).toEqual({ "grok/s1": "Hi" });
  });
});
```

- [ ] **Step 2–4:** implement, pass, commit only those two files.

```
feat: migrate webui session keys into ~/.acp-workbench
```

Implementation notes: `migrateSessionKeyMap` — for each key, if `parseSessionRefKey(key)` is non-null, use `sessionRefKey` of that ref as the output key (so `abc` → `grok/abc`). Drop keys that parse to null (empty).

---

### Task 3: Stamp SessionSummary.agentId and selectedAgent lock

**Files:**
- Create: `src/lib/session-agent.ts`
- Create: `src/lib/session-agent.test.ts`

**Interfaces:**
- `export function stampSessionAgent<T extends { id: string; agentId?: string | null }>(s: T, fallback: AgentId = "grok"): T & { agentId: AgentId }` — if `s.agentId` is an AgentId keep it; else fallback
- `export function canChangeSelectedAgent(hasOpenSession: boolean): boolean` — `!hasOpenSession`
- `export function nextSelectedAgent(hasOpenSession: boolean, current: AgentId, requested: AgentId): AgentId` — if `canChangeSelectedAgent` then `requested`, else `current`

- [ ] **Step 1: failing tests**

```ts
import { describe, expect, it } from "vitest";
import { canChangeSelectedAgent, nextSelectedAgent, stampSessionAgent } from "./session-agent";

describe("stampSessionAgent", () => {
  it("defaults missing brand to grok", () => {
    expect(stampSessionAgent({ id: "s1" }).agentId).toBe("grok");
    expect(stampSessionAgent({ id: "s1", agentId: "claude" }).agentId).toBe("claude");
    expect(stampSessionAgent({ id: "s1", agentId: "nope" }).agentId).toBe("grok");
  });
});

describe("nextSelectedAgent", () => {
  it("forbids switching on an open session", () => {
    expect(canChangeSelectedAgent(true)).toBe(false);
    expect(nextSelectedAgent(true, "grok", "kimi")).toBe("grok");
    expect(nextSelectedAgent(false, "grok", "kimi")).toBe("kimi");
  });
});
```

- [ ] **Step 2–4:** implement, pass, commit two new files.

```
feat: stamp session agentId and lock agent changes mid-session
```

---

### Task 4: Marketplace skill folder dest

**Files:**
- Create: `src/lib/marketplace-skill.ts`
- Create: `src/lib/marketplace-skill.test.ts`

**Interfaces:**
- `export function skillFolderName(sourcePath: string): string | null` — basename, then `skillNameOk`; reject `.` `..` empty
- `export function marketplaceInstallDest(agentsHome: string, name: string): string` — `{agentsHome}/skills/{name}`
- `export function marketplaceInstallBlocked(destExists: boolean, destIsCanonicalSymlink: boolean): boolean` — true when dest exists and is **not** already our folder (destExists && !destIsCanonicalSymlink). If dest exists as the install target we will write, treat as blocked unless it is empty — keep it simple: destExists → blocked (do not overwrite). `destIsCanonicalSymlink` unused if destExists always blocks; **do not add unused params**. So: `export function marketplaceInstallBlocked(destExists: boolean): boolean { return destExists; }`

Wait — unused param is YAGNI. Use only `destExists`.

- [ ] **Step 1:**

```ts
import { describe, expect, it } from "vitest";
import { marketplaceInstallBlocked, marketplaceInstallDest, skillFolderName } from "./marketplace-skill";

describe("marketplace skill install", () => {
  it("accepts a skill-shaped folder name", () => {
    expect(skillFolderName("/tmp/pdf-review")).toBe("pdf-review");
    expect(skillFolderName("/tmp/Pdf")).toBeNull();
    expect(skillFolderName("/tmp/.")).toBeNull();
    expect(marketplaceInstallDest("/Users/me/.agents", "pdf-review")).toBe(
      "/Users/me/.agents/skills/pdf-review",
    );
    expect(marketplaceInstallBlocked(true)).toBe(true);
    expect(marketplaceInstallBlocked(false)).toBe(false);
  });
});
```

- [ ] **Step 2–4:** implement using `skillNameOk` from `./agents-store`. Commit two files.

```
feat: compute marketplace skill install destination under ~/.agents
```

```ts
import { skillDir, skillNameOk } from "./agents-store";

export function skillFolderName(sourcePath: string): string | null {
  const trimmed = sourcePath.replace(/\/+$/, "");
  const base = trimmed.split("/").pop() ?? "";
  if (!skillNameOk(base)) return null;
  return base;
}

export function marketplaceInstallDest(agentsHome: string, name: string): string {
  return skillDir(agentsHome, name);
}

export function marketplaceInstallBlocked(destExists: boolean): boolean {
  return destExists;
}
```

---
