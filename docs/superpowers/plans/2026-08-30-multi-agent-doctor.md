# Multi-Agent Doctor Homes Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add `AgentDoctor` types and default home/login paths for grok/kimi/claude/codex so later adapters can fill `authKind` without inventing CLI-specific UI.

**Architecture:** Spec doctor DTO. Pure TS. No spawn. No doctor Tauri command rewrite in this file except optional later task.

**Tech Stack:** TypeScript + Vitest.

## Global Constraints

- AgentId closed enum. AuthKind from `./auth-kind`. API key wins.
- No plugins, imagine, cc-switch.
- Dirty-file isolation. Never `git add -A`. TDD.

---

### Task 1: AgentDoctor type and default homes

**Files:**
- Create: `src/lib/agent-doctor.ts`
- Create: `src/lib/agent-doctor.test.ts`

**Interfaces:**
- `export type AgentDoctor = { agentId: AgentId; binary: string | null; version: string | null; home: string; authPresent: boolean; authKind: AuthKind; acpSpawnOk: boolean; loginHint: string[] }`
- `export function defaultAgentHome(home: string, id: AgentId): string` — grok `.grok`, kimi `.kimi-code`, claude `.claude`, codex `.codex` under stripped `home`
- `export function defaultLoginHint(id: AgentId): string[]` — grok/kimi/claude/codex all `["login"]` matching spawn profiles
- `export function emptyDoctor(id: AgentId, userHome: string): AgentDoctor` — binary/version null, authPresent false, authKind `"none"`, acpSpawnOk false, home = defaultAgentHome, loginHint = defaultLoginHint

- [ ] **Step 1: failing test**

```ts
import { describe, expect, it } from "vitest";
import { defaultAgentHome, defaultLoginHint, emptyDoctor } from "./agent-doctor";

describe("defaultAgentHome", () => {
  it("maps each CLI to its native home", () => {
    expect(defaultAgentHome("/Users/me/", "grok")).toBe("/Users/me/.grok");
    expect(defaultAgentHome("/Users/me", "kimi")).toBe("/Users/me/.kimi-code");
    expect(defaultAgentHome("/Users/me", "claude")).toBe("/Users/me/.claude");
    expect(defaultAgentHome("/Users/me", "codex")).toBe("/Users/me/.codex");
  });
});

describe("emptyDoctor", () => {
  it("starts unauthenticated", () => {
    expect(emptyDoctor("kimi", "/Users/me")).toEqual({
      agentId: "kimi",
      binary: null,
      version: null,
      home: "/Users/me/.kimi-code",
      authPresent: false,
      authKind: "none",
      acpSpawnOk: false,
      loginHint: ["login"],
    });
    expect(defaultLoginHint("grok")).toEqual(["login"]);
  });
});
```

- [ ] **Step 2:** `npm test -- src/lib/agent-doctor.test.ts` FAIL then implement.

```ts
import type { AgentId } from "./agent-id";
import type { AuthKind } from "./auth-kind";

export type AgentDoctor = {
  agentId: AgentId;
  binary: string | null;
  version: string | null;
  home: string;
  authPresent: boolean;
  authKind: AuthKind;
  acpSpawnOk: boolean;
  loginHint: string[];
};

export function defaultAgentHome(home: string, id: AgentId): string {
  const root = home.replace(/\/$/, "");
  const folder =
    id === "grok" ? ".grok" : id === "kimi" ? ".kimi-code" : id === "claude" ? ".claude" : ".codex";
  return `${root}/${folder}`;
}

export function defaultLoginHint(id: AgentId): string[] {
  void id;
  return ["login"];
}

export function emptyDoctor(id: AgentId, userHome: string): AgentDoctor {
  return {
    agentId: id,
    binary: null,
    version: null,
    home: defaultAgentHome(userHome, id),
    authPresent: false,
    authKind: "none",
    acpSpawnOk: false,
    loginHint: defaultLoginHint(id),
  };
}
```

Do not keep `void id` if you use a switch instead.

- [ ] **Step 3:** tests PASS. Commit only the two new files.

```
feat: add AgentDoctor homes and empty unauthenticated state
```

---
