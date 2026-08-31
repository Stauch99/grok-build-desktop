# Multi-Agent Store and Profiles Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Land spawn profiles, tagged ACP event helpers, `~/.agents` persist/sync algorithms, Claude/Kimi MCP document merges, and a Rust process-pool type — without wiring `start_agent`, spawning other CLIs, or rewriting hub UI.

**Architecture:** Spec is `docs/superpowers/specs/2026-08-30-multi-agent-acp-workbench-design.md`. Wave 1 already shipped `AgentId`, `AgentsStore` path/catalog helpers, and the RPC allowlist module. This wave adds the next layer of **pure** store/sync/profile logic in new files. Process-pool **wiring** into `AppState` / `start_agent` is a later plan so we do not fight the dirty P0–P2 `lib.rs` diff.

**Tech Stack:** TypeScript + Vitest (`npm test`), Rust unit tests in a new `src-tauri/src/agent_host.rs` (`cargo test --manifest-path src-tauri/Cargo.toml agent_host`). No new npm/cargo dependencies.

## Global Constraints

- Spec path: `docs/superpowers/specs/2026-08-30-multi-agent-acp-workbench-design.md`. Follow locked product decisions in that file.
- `AgentId` closed enum: `"grok" | "kimi" | "claude" | "codex"` only. Import from `src/lib/agent-id.ts`; do not redefine.
- Do not spawn Claude/Codex/Kimi processes. Do not change `start_agent` argv or `AppState.session`.
- Do not implement plugins, plugin marketplace, or imagine/video providers.
- Do not read `~/.cc-switch/cc-switch.db`. Canonical skills/MCP live under `~/.agents`.
- Do not write real user home files in tests. Use in-memory mocks or temp strings only.
- Leave existing dirty working-tree files unless this task’s Files list includes them. `git add` only files this task owns. Never `git add -A`.
- Tests: `npm test -- src/lib/<file>.test.ts` for TS; `cargo test --manifest-path src-tauri/Cargo.toml agent_host -- --nocapture` for Rust. TDD: failing test first.
- Chinese UI copy is out of scope.
- `~/.agents` is the only editor target for skill markdown. Sync never copy-mutates `SKILL.md`.

## Follow-on plans (do not execute in this file)

- Wire `AgentPool` into `AppState` + `start_agent(agentId)` + tagged emit
- Phase 0 live ACP probes + pin npm adapter versions
- Hub UI: drop plugins tab, marketplace = skill install, first-open import
- Grok/Codex live TOML MCP writers
- Kimi / Claude / Codex session adapters
- Usage overlay brand switcher chrome

---

### Task 1: Agent spawn profiles

**Files:**
- Create: `src/lib/agent-profile.ts`
- Create: `src/lib/agent-profile.test.ts`

**Interfaces:**
- Consumes: `AgentId` from `./agent-id`
- Produces:
  - `export type AgentProfile = { id: AgentId; label: string; command: string; args: string[]; loginArgs: string[] }`
  - `export function defaultProfile(id: AgentId): AgentProfile`
  - `export function defaultProfiles(): Record<AgentId, AgentProfile>`

Default argv (do not pin npm versions):

| id | label | command | args | loginArgs |
|---|---|---|---|---|
| grok | Grok | grok | `["agent", "stdio"]` | `["login"]` |
| kimi | Kimi | kimi | `["acp"]` | `["login"]` |
| claude | Claude | npx | `["-y", "@agentclientprotocol/claude-agent-acp"]` | `["login"]` |
| codex | Codex | npx | `["-y", "@agentclientprotocol/codex-acp"]` | `["login"]` |

- [ ] **Step 1: Write the failing test**

```ts
import { describe, expect, it } from "vitest";
import { AGENT_IDS } from "./agent-id";
import { defaultProfile, defaultProfiles } from "./agent-profile";

describe("defaultProfile", () => {
  it("uses the locked ACP argv per AgentId", () => {
    expect(defaultProfile("grok")).toEqual({
      id: "grok",
      label: "Grok",
      command: "grok",
      args: ["agent", "stdio"],
      loginArgs: ["login"],
    });
    expect(defaultProfile("kimi")).toEqual({
      id: "kimi",
      label: "Kimi",
      command: "kimi",
      args: ["acp"],
      loginArgs: ["login"],
    });
    expect(defaultProfile("claude")).toEqual({
      id: "claude",
      label: "Claude",
      command: "npx",
      args: ["-y", "@agentclientprotocol/claude-agent-acp"],
      loginArgs: ["login"],
    });
    expect(defaultProfile("codex")).toEqual({
      id: "codex",
      label: "Codex",
      command: "npx",
      args: ["-y", "@agentclientprotocol/codex-acp"],
      loginArgs: ["login"],
    });
  });
});

describe("defaultProfiles", () => {
  it("covers every AgentId exactly once", () => {
    const all = defaultProfiles();
    expect(Object.keys(all).sort()).toEqual([...AGENT_IDS].sort());
    for (const id of AGENT_IDS) {
      expect(all[id]).toEqual(defaultProfile(id));
    }
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npm test -- src/lib/agent-profile.test.ts`
Expected: FAIL (module not found)

- [ ] **Step 3: Write minimal implementation**

```ts
import type { AgentId } from "./agent-id";
import { AGENT_IDS } from "./agent-id";

export type AgentProfile = {
  id: AgentId;
  label: string;
  command: string;
  args: string[];
  loginArgs: string[];
};

export function defaultProfile(id: AgentId): AgentProfile {
  switch (id) {
    case "grok":
      return { id, label: "Grok", command: "grok", args: ["agent", "stdio"], loginArgs: ["login"] };
    case "kimi":
      return { id, label: "Kimi", command: "kimi", args: ["acp"], loginArgs: ["login"] };
    case "claude":
      return {
        id,
        label: "Claude",
        command: "npx",
        args: ["-y", "@agentclientprotocol/claude-agent-acp"],
        loginArgs: ["login"],
      };
    case "codex":
      return {
        id,
        label: "Codex",
        command: "npx",
        args: ["-y", "@agentclientprotocol/codex-acp"],
        loginArgs: ["login"],
      };
  }
}

export function defaultProfiles(): Record<AgentId, AgentProfile> {
  return {
    grok: defaultProfile("grok"),
    kimi: defaultProfile("kimi"),
    claude: defaultProfile("claude"),
    codex: defaultProfile("codex"),
  };
}

void AGENT_IDS;
```

Do **not** keep the `void AGENT_IDS` line if unused. Prefer not importing `AGENT_IDS` in the impl file.

- [ ] **Step 4: Run test to verify it passes**

Run: `npm test -- src/lib/agent-profile.test.ts`
Expected: PASS

- [ ] **Step 5: Commit**

```bash
git add src/lib/agent-profile.ts src/lib/agent-profile.test.ts
git commit -m "$(cat <<'EOF'
feat: add default ACP spawn profiles for four CLIs

EOF
)"
```

---

### Task 2: Tagged ACP event unwrap

**Files:**
- Create: `src/lib/acp-event-tag.ts`
- Create: `src/lib/acp-event-tag.test.ts`

**Interfaces:**
- Consumes: `AgentId`, `isAgentId` from `./agent-id`
- Produces:
  - `export type TaggedAcpEvent = { agentId: AgentId; generation: number; payload: unknown }`
  - `export function wrapAcpEvent(agentId: AgentId, generation: number, payload: unknown): TaggedAcpEvent`
  - `export function unwrapAcpEvent(raw: unknown): TaggedAcpEvent`

`unwrapAcpEvent` rules:

1. If `raw` is a non-array object with `agentId` that `isAgentId` accepts **and** a `payload` key, return `{ agentId, generation, payload }`. `generation` is the number if `typeof generation === "number"`, else `0`.
2. Otherwise return `{ agentId: "grok", generation: 0, payload: raw }` (legacy `acp-message` body).

- [ ] **Step 1: Write the failing test**

```ts
import { describe, expect, it } from "vitest";
import { unwrapAcpEvent, wrapAcpEvent } from "./acp-event-tag";

describe("wrapAcpEvent", () => {
  it("builds the host envelope", () => {
    const payload = { jsonrpc: "2.0", method: "session/update" };
    expect(wrapAcpEvent("claude", 3, payload)).toEqual({
      agentId: "claude",
      generation: 3,
      payload,
    });
  });
});

describe("unwrapAcpEvent", () => {
  it("reads a tagged envelope", () => {
    const payload = { jsonrpc: "2.0", id: 1, result: {} };
    expect(unwrapAcpEvent({ agentId: "kimi", generation: 2, payload })).toEqual({
      agentId: "kimi",
      generation: 2,
      payload,
    });
  });

  it("treats a bare JSON-RPC body as grok", () => {
    const raw = { jsonrpc: "2.0", method: "session/update" };
    expect(unwrapAcpEvent(raw)).toEqual({ agentId: "grok", generation: 0, payload: raw });
  });

  it("rejects unknown agentId and missing payload", () => {
    expect(unwrapAcpEvent({ agentId: "gemini", payload: {} })).toEqual({
      agentId: "grok",
      generation: 0,
      payload: { agentId: "gemini", payload: {} },
    });
    expect(unwrapAcpEvent({ agentId: "claude", generation: 1 })).toEqual({
      agentId: "grok",
      generation: 0,
      payload: { agentId: "claude", generation: 1 },
    });
  });

  it("defaults a non-number generation to 0", () => {
    expect(unwrapAcpEvent({ agentId: "codex", generation: "9", payload: 1 })).toEqual({
      agentId: "codex",
      generation: 0,
      payload: 1,
    });
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npm test -- src/lib/acp-event-tag.test.ts`
Expected: FAIL (module not found)

- [ ] **Step 3: Write minimal implementation**

```ts
import { isAgentId, type AgentId } from "./agent-id";

export type TaggedAcpEvent = {
  agentId: AgentId;
  generation: number;
  payload: unknown;
};

export function wrapAcpEvent(
  agentId: AgentId,
  generation: number,
  payload: unknown,
): TaggedAcpEvent {
  return { agentId, generation, payload };
}

export function unwrapAcpEvent(raw: unknown): TaggedAcpEvent {
  if (raw && typeof raw === "object" && !Array.isArray(raw)) {
    const o = raw as Record<string, unknown>;
    if (typeof o.agentId === "string" && isAgentId(o.agentId) && "payload" in o) {
      return {
        agentId: o.agentId,
        generation: typeof o.generation === "number" ? o.generation : 0,
        payload: o.payload,
      };
    }
  }
  return { agentId: "grok", generation: 0, payload: raw };
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npm test -- src/lib/acp-event-tag.test.ts`
Expected: PASS

- [ ] **Step 5: Commit**

```bash
git add src/lib/acp-event-tag.ts src/lib/acp-event-tag.test.ts
git commit -m "$(cat <<'EOF'
feat: wrap and unwrap ACP events tagged by AgentId

EOF
)"
```

---

### Task 3: Canonical catalog persist helpers

**Files:**
- Modify: `src/lib/agents-store.ts`
- Modify: `src/lib/agents-store.test.ts`

**Interfaces:**
- Consumes: existing `McpServer`, `AgentsSync`, `SyncFlags`, `defaultSyncFlags`, `skillNameOk`, `AGENT_IDS`
- Produces:
  - `export function skillMarkdown(name: string, description: string): string`
  - `export function stringifyMcpJson(servers: McpServer[]): string`
  - `export function stringifySyncJson(sync: AgentsSync): string`
  - `export function parseSyncJson(raw: unknown): AgentsSync`

`skillMarkdown` body (exact, including trailing newline after the title heading’s blank line is optional; tests lock the string):

```
---
name: {name}
description: {description}
user-invocable: true
---

# {name}

```

`stringifyMcpJson` / `stringifySyncJson` use `JSON.stringify(value, null, 2)` plus a trailing newline. MCP file shape is `{ servers }`.

`parseSyncJson`:

- Invalid / non-object / array → `{ skills: {}, mcp: {} }`
- `skills` / `mcp` must be objects; otherwise that side is `{}`
- Each entry’s flags: start from `{ grok: false, kimi: false, claude: false, codex: false }`, set a key only when the raw value is strictly `true` or `false`. Other keys ignored.

- [ ] **Step 1: Write the failing tests** (append to `agents-store.test.ts`)

```ts
import {
  parseSyncJson,
  skillMarkdown,
  stringifyMcpJson,
  stringifySyncJson,
} from "./agents-store";

describe("skillMarkdown", () => {
  it("writes the canonical SKILL.md front matter", () => {
    expect(skillMarkdown("pdf-review", "Extract tables from PDFs")).toBe(
      `---
name: pdf-review
description: Extract tables from PDFs
user-invocable: true
---

# pdf-review
`,
    );
  });
});

describe("stringify catalog files", () => {
  it("pretty-prints mcp.json and sync.json with a trailing newline", () => {
    const servers = [{ name: "git", transport: "stdio" as const, commandOrUrl: "uvx" }];
    expect(stringifyMcpJson(servers)).toBe(`${JSON.stringify({ servers }, null, 2)}\n`);
    const sync = {
      skills: { pdf: { grok: true, kimi: false, claude: true, codex: true } },
      mcp: {},
    };
    expect(stringifySyncJson(sync)).toBe(`${JSON.stringify(sync, null, 2)}\n`);
  });
});

describe("parseSyncJson", () => {
  it("returns empty maps for junk", () => {
    expect(parseSyncJson(null)).toEqual({ skills: {}, mcp: {} });
    expect(parseSyncJson([])).toEqual({ skills: {}, mcp: {} });
    expect(parseSyncJson({ skills: [], mcp: "x" })).toEqual({ skills: {}, mcp: {} });
  });

  it("keeps only boolean AgentId flags", () => {
    expect(
      parseSyncJson({
        skills: { pdf: { grok: true, kimi: 1, claude: false, extra: true } },
        mcp: { git: { grok: true } },
      }),
    ).toEqual({
      skills: { pdf: { grok: true, kimi: false, claude: false, codex: false } },
      mcp: { git: { grok: true, kimi: false, claude: false, codex: false } },
    });
  });
});
```

- [ ] **Step 2: Run test to verify new ones fail**

Run: `npm test -- src/lib/agents-store.test.ts`
Expected: FAIL (exports missing)

- [ ] **Step 3: Write minimal implementation** (append to `agents-store.ts`)

```ts
import { AGENT_IDS } from "./agent-id";

export function skillMarkdown(name: string, description: string): string {
  return `---
name: ${name}
description: ${description}
user-invocable: true
---

# ${name}
`;
}

export function stringifyMcpJson(servers: McpServer[]): string {
  return `${JSON.stringify({ servers }, null, 2)}\n`;
}

export function stringifySyncJson(sync: AgentsSync): string {
  return `${JSON.stringify(sync, null, 2)}\n`;
}

function parseFlags(raw: unknown): SyncFlags {
  const out: SyncFlags = { grok: false, kimi: false, claude: false, codex: false };
  if (!raw || typeof raw !== "object" || Array.isArray(raw)) return out;
  const rec = raw as Record<string, unknown>;
  for (const id of AGENT_IDS) {
    if (typeof rec[id] === "boolean") out[id] = rec[id];
  }
  return out;
}

function parseFlagMap(raw: unknown): Record<string, SyncFlags> {
  if (!raw || typeof raw !== "object" || Array.isArray(raw)) return {};
  const rec = raw as Record<string, unknown>;
  const out: Record<string, SyncFlags> = {};
  for (const [name, flags] of Object.entries(rec)) {
    out[name] = parseFlags(flags);
  }
  return out;
}

export function parseSyncJson(raw: unknown): AgentsSync {
  if (!raw || typeof raw !== "object" || Array.isArray(raw)) {
    return { skills: {}, mcp: {} };
  }
  const rec = raw as Record<string, unknown>;
  return { skills: parseFlagMap(rec.skills), mcp: parseFlagMap(rec.mcp) };
}
```

`AGENT_IDS` import goes at the top of the file next to the existing `AgentId` import: `import { AGENT_IDS, type AgentId } from "./agent-id";`

- [ ] **Step 4: Run test to verify it passes**

Run: `npm test -- src/lib/agents-store.test.ts`
Expected: PASS (old + new)

- [ ] **Step 5: Commit**

`agents-store.ts` / `.test.ts` may already have uncommitted Wave-1 work in the working tree. **Only if `git status` shows them as already committed (clean vs HEAD except your edits):**

```bash
git add src/lib/agents-store.ts src/lib/agents-store.test.ts
git commit -m "$(cat <<'EOF'
feat: persist ~/.agents skill markdown, mcp.json, and sync.json

EOF
)"
```

If those files are dirty with unrelated edits, isolate: copy your new functions into a checkout of `HEAD` versions, `git add` only those two files, commit, then restore the dirty copies. Never `git add -A`.

---

### Task 4: Skill symlink sync

**Files:**
- Create: `src/lib/skill-link.ts`
- Create: `src/lib/skill-link.test.ts`

**Interfaces:**
- Consumes: `AgentId` from `./agent-id`
- Produces:
  - `export type SkillLinkFs = { exists(path: string): boolean; isSymlink(path: string): boolean; readlink(path: string): string; mkdirp(path: string): void; symlink(from: string, to: string): void; unlink(path: string): void }`
  - `export type SkillLinkResult = "linked" | "unlinked" | "conflict" | "kept" | "noop"`
  - `export function skillLinkDest(home: string, agentId: AgentId, name: string): string`
  - `export function applySkillLink(fs: SkillLinkFs, canonicalDir: string, destDir: string, enabled: boolean): SkillLinkResult`

`skillLinkDest` (strip trailing `/` on `home`):

| agentId | dest |
|---|---|
| grok | `{home}/.grok/skills/{name}` |
| kimi | `{home}/.kimi-code/skills/{name}` |
| claude | `{home}/.claude/skills/{name}` |
| codex | `{home}/.codex/skills/{name}` |

`applySkillLink` (never writes SKILL.md contents):

- `enabled === true`:
  - dest missing → `mkdirp(parent of destDir)`, `symlink(canonicalDir, destDir)` → `"linked"`
  - dest is a symlink whose `readlink` equals `canonicalDir` → `"noop"`
  - dest is a symlink to something else → `unlink`, then `symlink` → `"linked"`
  - dest exists and is **not** a symlink → `"conflict"` (do not touch)
- `enabled === false`:
  - dest missing → `"noop"`
  - dest is a symlink to `canonicalDir` → `unlink` → `"unlinked"`
  - dest is a symlink to something else, or a real file/dir → `"kept"`

Parent of dest: dest string with the last `/{name}` segment removed (`destDir.slice(0, destDir.lastIndexOf("/"))`). If `lastIndexOf` is `< 0`, `mkdirp` `"."`.

- [ ] **Step 1: Write the failing test**

```ts
import { describe, expect, it } from "vitest";
import { applySkillLink, skillLinkDest, type SkillLinkFs } from "./skill-link";

function memFs(init: Record<string, { link?: string } | true> = {}): SkillLinkFs & {
  nodes: Record<string, { link?: string } | true>;
} {
  const nodes = { ...init };
  return {
    nodes,
    exists: (p) => p in nodes,
    isSymlink: (p) => typeof nodes[p] === "object" && !!nodes[p]?.link,
    readlink: (p) => {
      const n = nodes[p];
      if (typeof n === "object" && n.link) return n.link;
      throw new Error(`not a symlink: ${p}`);
    },
    mkdirp: () => {},
    symlink: (from, to) => {
      nodes[to] = { link: from };
    },
    unlink: (p) => {
      delete nodes[p];
    },
  };
}

describe("skillLinkDest", () => {
  it("maps each CLI to its native skills folder", () => {
    const home = "/Users/me/";
    expect(skillLinkDest(home, "grok", "pdf")).toBe("/Users/me/.grok/skills/pdf");
    expect(skillLinkDest(home, "kimi", "pdf")).toBe("/Users/me/.kimi-code/skills/pdf");
    expect(skillLinkDest(home, "claude", "pdf")).toBe("/Users/me/.claude/skills/pdf");
    expect(skillLinkDest(home, "codex", "pdf")).toBe("/Users/me/.codex/skills/pdf");
  });
});

describe("applySkillLink", () => {
  const canonical = "/Users/me/.agents/skills/pdf";
  const dest = "/Users/me/.claude/skills/pdf";

  it("links when enabled and dest is free", () => {
    const fs = memFs();
    expect(applySkillLink(fs, canonical, dest, true)).toBe("linked");
    expect(fs.nodes[dest]).toEqual({ link: canonical });
  });

  it("is noop when the symlink already points at canonical", () => {
    const fs = memFs({ [dest]: { link: canonical } });
    expect(applySkillLink(fs, canonical, dest, true)).toBe("noop");
  });

  it("replaces a stale symlink", () => {
    const fs = memFs({ [dest]: { link: "/old/pdf" } });
    expect(applySkillLink(fs, canonical, dest, true)).toBe("linked");
    expect(fs.nodes[dest]).toEqual({ link: canonical });
  });

  it("refuses to overwrite a real skill folder", () => {
    const fs = memFs({ [dest]: true });
    expect(applySkillLink(fs, canonical, dest, true)).toBe("conflict");
    expect(fs.nodes[dest]).toBe(true);
  });

  it("unlinks only our symlink when disabled", () => {
    const ours = memFs({ [dest]: { link: canonical } });
    expect(applySkillLink(ours, canonical, dest, false)).toBe("unlinked");
    expect(ours.exists(dest)).toBe(false);

    const foreign = memFs({ [dest]: { link: "/other" } });
    expect(applySkillLink(foreign, canonical, dest, false)).toBe("kept");
    expect(foreign.exists(dest)).toBe(true);

    const real = memFs({ [dest]: true });
    expect(applySkillLink(real, canonical, dest, false)).toBe("kept");

    const missing = memFs();
    expect(applySkillLink(missing, canonical, dest, false)).toBe("noop");
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npm test -- src/lib/skill-link.test.ts`
Expected: FAIL (module not found)

- [ ] **Step 3: Write minimal implementation**

```ts
import type { AgentId } from "./agent-id";

export type SkillLinkFs = {
  exists(path: string): boolean;
  isSymlink(path: string): boolean;
  readlink(path: string): string;
  mkdirp(path: string): void;
  symlink(from: string, to: string): void;
  unlink(path: string): void;
};

export type SkillLinkResult = "linked" | "unlinked" | "conflict" | "kept" | "noop";

export function skillLinkDest(home: string, agentId: AgentId, name: string): string {
  const root = home.replace(/\/$/, "");
  const folder =
    agentId === "grok"
      ? ".grok/skills"
      : agentId === "kimi"
        ? ".kimi-code/skills"
        : agentId === "claude"
          ? ".claude/skills"
          : ".codex/skills";
  return `${root}/${folder}/${name}`;
}

function parentDir(destDir: string): string {
  const i = destDir.lastIndexOf("/");
  return i < 0 ? "." : destDir.slice(0, i);
}

export function applySkillLink(
  fs: SkillLinkFs,
  canonicalDir: string,
  destDir: string,
  enabled: boolean,
): SkillLinkResult {
  if (enabled) {
    if (!fs.exists(destDir)) {
      fs.mkdirp(parentDir(destDir));
      fs.symlink(canonicalDir, destDir);
      return "linked";
    }
    if (fs.isSymlink(destDir)) {
      if (fs.readlink(destDir) === canonicalDir) return "noop";
      fs.unlink(destDir);
      fs.symlink(canonicalDir, destDir);
      return "linked";
    }
    return "conflict";
  }
  if (!fs.exists(destDir)) return "noop";
  if (fs.isSymlink(destDir) && fs.readlink(destDir) === canonicalDir) {
    fs.unlink(destDir);
    return "unlinked";
  }
  return "kept";
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npm test -- src/lib/skill-link.test.ts`
Expected: PASS

- [ ] **Step 5: Commit**

```bash
git add src/lib/skill-link.ts src/lib/skill-link.test.ts
git commit -m "$(cat <<'EOF'
feat: sync ~/.agents skills into each CLI via symlink

EOF
)"
```

---

### Task 5: Claude and Kimi live MCP document merge

**Files:**
- Create: `src/lib/mcp-live.ts`
- Create: `src/lib/mcp-live.test.ts`

**Interfaces:**
- Consumes: `McpServer`, `parseMcpJson` from `./agents-store`
- Produces:
  - `export type ClaudeMcpEntry = { command?: string; args?: string[]; env?: Record<string, string>; type?: "http" | "sse"; url?: string }`
  - `export function mcpServerToClaude(server: McpServer): ClaudeMcpEntry`
  - `export function mergeClaudeMcpDoc(doc: unknown, servers: McpServer[]): Record<string, unknown>`
  - `export function removeClaudeMcpServer(doc: unknown, name: string): Record<string, unknown>`
  - `export function mergeKimiMcpDoc(doc: unknown, servers: McpServer[]): { servers: McpServer[] }`
  - `export function removeKimiMcpServer(doc: unknown, name: string): { servers: McpServer[] }`

`mcpServerToClaude`:

- `transport === "stdio"` → `{ command: commandOrUrl, args?, env? }` (`args` omitted if empty/missing; `env` from `KEY=value` rows, omit if none parse)
- `transport === "http"` → `{ type: "http", url: commandOrUrl }`
- `transport === "sse"` → `{ type: "sse", url: commandOrUrl }`
- Do not emit `command`/`url` when `commandOrUrl` is missing.

`env` parse: split each `env` string on the **first** `=`. Skip rows with no `=` or with an empty key.

`mergeClaudeMcpDoc`: start from `doc` if it is a non-array object, else `{}`. Preserve unknown top-level keys. Upsert `mcpServers[name]` for each given server (overwrite that name). Do not delete other `mcpServers` keys.

`removeClaudeMcpServer`: same clone rules; delete `mcpServers[name]` if present.

`mergeKimiMcpDoc`: parse existing via `parseMcpJson(doc)`, then upsert by `name` (incoming wins), return `{ servers }`.

`removeKimiMcpServer`: `{ servers: parseMcpJson(doc).filter((s) => s.name !== name) }`.

Do **not** write TOML (Grok/Codex) in this task.

- [ ] **Step 1: Write the failing test**

```ts
import { describe, expect, it } from "vitest";
import type { McpServer } from "./agents-store";
import {
  mcpServerToClaude,
  mergeClaudeMcpDoc,
  mergeKimiMcpDoc,
  removeClaudeMcpServer,
  removeKimiMcpServer,
} from "./mcp-live";

const git: McpServer = {
  name: "git",
  transport: "stdio",
  commandOrUrl: "uvx",
  args: ["mcp-git"],
  env: ["TOKEN=abc", "NOPE", "=x", "OK=1=2"],
};
const docs: McpServer = { name: "docs", transport: "http", commandOrUrl: "https://example.com" };

describe("mcpServerToClaude", () => {
  it("maps stdio and http", () => {
    expect(mcpServerToClaude(git)).toEqual({
      command: "uvx",
      args: ["mcp-git"],
      env: { TOKEN: "abc", OK: "1=2" },
    });
    expect(mcpServerToClaude(docs)).toEqual({ type: "http", url: "https://example.com" });
    expect(mcpServerToClaude({ name: "x", transport: "sse", commandOrUrl: "https://sse" })).toEqual({
      type: "sse",
      url: "https://sse",
    });
    expect(mcpServerToClaude({ name: "bare", transport: "stdio" })).toEqual({});
  });
});

describe("mergeClaudeMcpDoc", () => {
  it("upserts mcpServers and keeps other keys", () => {
    const next = mergeClaudeMcpDoc({ theme: "dark", mcpServers: { old: { command: "a" } } }, [git]);
    expect(next.theme).toBe("dark");
    expect(next.mcpServers).toEqual({
      old: { command: "a" },
      git: { command: "uvx", args: ["mcp-git"], env: { TOKEN: "abc", OK: "1=2" } },
    });
  });
});

describe("removeClaudeMcpServer", () => {
  it("drops one name only", () => {
    expect(removeClaudeMcpServer({ mcpServers: { git: { command: "uvx" }, docs: { url: "u" } } }, "git")).toEqual({
      mcpServers: { docs: { url: "u" } },
    });
  });
});

describe("kimi mcp.json", () => {
  it("lets incoming win on name and can remove", () => {
    const existing = { servers: [{ name: "git", transport: "http", commandOrUrl: "https://old" }] };
    expect(mergeKimiMcpDoc(existing, [git, docs]).servers.map((s) => s.name)).toEqual(["git", "docs"]);
    expect(mergeKimiMcpDoc(existing, [git]).servers[0]).toEqual(git);
    expect(removeKimiMcpServer({ servers: [git, docs] }, "git").servers).toEqual([docs]);
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npm test -- src/lib/mcp-live.test.ts`
Expected: FAIL (module not found)

- [ ] **Step 3: Write minimal implementation**

```ts
import { parseMcpJson, type McpServer } from "./agents-store";

export type ClaudeMcpEntry = {
  command?: string;
  args?: string[];
  env?: Record<string, string>;
  type?: "http" | "sse";
  url?: string;
};

function envRecord(env?: string[]): Record<string, string> | undefined {
  if (!env?.length) return undefined;
  const out: Record<string, string> = {};
  for (const row of env) {
    const i = row.indexOf("=");
    if (i <= 0) continue;
    out[row.slice(0, i)] = row.slice(i + 1);
  }
  return Object.keys(out).length ? out : undefined;
}

export function mcpServerToClaude(server: McpServer): ClaudeMcpEntry {
  if (server.transport === "http" || server.transport === "sse") {
    const entry: ClaudeMcpEntry = { type: server.transport };
    if (server.commandOrUrl) entry.url = server.commandOrUrl;
    return entry;
  }
  const entry: ClaudeMcpEntry = {};
  if (server.commandOrUrl) entry.command = server.commandOrUrl;
  if (server.args?.length) entry.args = server.args;
  const env = envRecord(server.env);
  if (env) entry.env = env;
  return entry;
}

function asObject(doc: unknown): Record<string, unknown> {
  if (doc && typeof doc === "object" && !Array.isArray(doc)) {
    return { ...(doc as Record<string, unknown>) };
  }
  return {};
}

function mcpServersMap(doc: Record<string, unknown>): Record<string, unknown> {
  const raw = doc.mcpServers;
  if (raw && typeof raw === "object" && !Array.isArray(raw)) {
    return { ...(raw as Record<string, unknown>) };
  }
  return {};
}

export function mergeClaudeMcpDoc(doc: unknown, servers: McpServer[]): Record<string, unknown> {
  const next = asObject(doc);
  const map = mcpServersMap(next);
  for (const server of servers) {
    map[server.name] = mcpServerToClaude(server);
  }
  next.mcpServers = map;
  return next;
}

export function removeClaudeMcpServer(doc: unknown, name: string): Record<string, unknown> {
  const next = asObject(doc);
  const map = mcpServersMap(next);
  delete map[name];
  next.mcpServers = map;
  return next;
}

export function mergeKimiMcpDoc(doc: unknown, servers: McpServer[]): { servers: McpServer[] } {
  const map = new Map(parseMcpJson(doc).map((row) => [row.name, row]));
  for (const row of servers) map.set(row.name, row);
  return { servers: [...map.values()] };
}

export function removeKimiMcpServer(doc: unknown, name: string): { servers: McpServer[] } {
  return { servers: parseMcpJson(doc).filter((row) => row.name !== name) };
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npm test -- src/lib/mcp-live.test.ts`
Expected: PASS

- [ ] **Step 5: Commit**

```bash
git add src/lib/mcp-live.ts src/lib/mcp-live.test.ts
git commit -m "$(cat <<'EOF'
feat: merge canonical MCP servers into Claude and Kimi JSON

EOF
)"
```

---

### Task 6: Rust AgentId, spawn profile, and process pool type

**Files:**
- Create: `src-tauri/src/agent_host.rs`
- Modify: `src-tauri/src/lib.rs` — add **only** `mod agent_host;` next to `mod rpc_allowlist;`. Do not change `AppState` or `start_agent`.

**Interfaces:**
- Consumes: nothing from the dirty session loop
- Produces (all `pub(crate)`):
  - `enum AgentId { Grok, Kimi, Claude, Codex }` with `as_str(&self) -> &'static str` and `fn parse(s: &str) -> Option<Self>`
  - `struct SpawnProfile { command: String, args: Vec<String> }`
  - `fn default_spawn_profile(id: AgentId) -> SpawnProfile` — same argv as Task 1 (`command` / `args` only; no login)
  - `struct AgentPool<T> { inner: HashMap<AgentId, T> }` with `new`, `insert` (returns previous), `get`, `get_mut`, `remove`, `contains`, `len`, `is_empty`

`AgentId::parse` accepts only the four lowercase strings. `"Grok"` → `None`.

**Isolation (required):** `lib.rs` has unrelated unstaged P0–P2 edits. Do **not** `git add src-tauri/src/lib.rs` from the dirty tree.

```bash
cp src-tauri/src/lib.rs /tmp/lib.rs.dirty
git show HEAD:src-tauri/src/lib.rs > src-tauri/src/lib.rs
# add `mod agent_host;` beside `mod rpc_allowlist;`
# write agent_host.rs, run cargo test
git add src-tauri/src/agent_host.rs src-tauri/src/lib.rs
git commit -m "feat: add AgentId process pool type for ACP children"
mv /tmp/lib.rs.dirty src-tauri/src/lib.rs
# re-apply `mod agent_host;` on the restored dirty file if the move wiped it
```

After restoring the dirty file, ensure it still contains `mod agent_host;` so the working tree compiles. If HEAD already had `mod rpc_allowlist;`, insert `mod agent_host;` on the line after it in **both** the committed snapshot and the restored dirty file.

- [ ] **Step 1: Write the failing tests** in `agent_host.rs` under `#[cfg(test)]`

```rust
#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn agent_id_parse_is_closed() {
        assert_eq!(AgentId::parse("grok"), Some(AgentId::Grok));
        assert_eq!(AgentId::parse("kimi"), Some(AgentId::Kimi));
        assert_eq!(AgentId::parse("claude"), Some(AgentId::Claude));
        assert_eq!(AgentId::parse("codex"), Some(AgentId::Codex));
        assert_eq!(AgentId::parse("Grok"), None);
        assert_eq!(AgentId::parse("gemini"), None);
        assert_eq!(AgentId::Grok.as_str(), "grok");
    }

    #[test]
    fn default_spawn_profile_matches_desktop_table() {
        let grok = default_spawn_profile(AgentId::Grok);
        assert_eq!(grok.command, "grok");
        assert_eq!(grok.args, vec!["agent", "stdio"]);
        let kimi = default_spawn_profile(AgentId::Kimi);
        assert_eq!(kimi.command, "kimi");
        assert_eq!(kimi.args, vec!["acp"]);
        let claude = default_spawn_profile(AgentId::Claude);
        assert_eq!(claude.command, "npx");
        assert_eq!(claude.args, vec!["-y", "@agentclientprotocol/claude-agent-acp"]);
        let codex = default_spawn_profile(AgentId::Codex);
        assert_eq!(codex.command, "npx");
        assert_eq!(codex.args, vec!["-y", "@agentclientprotocol/codex-acp"]);
    }

    #[test]
    fn pool_insert_get_remove() {
        let mut pool = AgentPool::new();
        assert!(pool.is_empty());
        assert_eq!(pool.insert(AgentId::Grok, 1), None);
        assert_eq!(pool.insert(AgentId::Grok, 2), Some(1));
        assert_eq!(pool.get(AgentId::Grok), Some(&2));
        assert!(pool.contains(AgentId::Grok));
        assert_eq!(pool.len(), 1);
        *pool.get_mut(AgentId::Grok).unwrap() = 3;
        assert_eq!(pool.remove(AgentId::Grok), Some(3));
        assert!(pool.get(AgentId::Grok).is_none());
        assert!(pool.is_empty());
    }
}
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `cargo test --manifest-path src-tauri/Cargo.toml agent_host -- --nocapture`
Expected: FAIL compiling (`mod agent_host` missing or types missing)

- [ ] **Step 3: Write minimal implementation** (top of `agent_host.rs`, above the tests)

```rust
use std::collections::HashMap;

#[derive(Clone, Copy, PartialEq, Eq, Hash, Debug)]
pub(crate) enum AgentId {
    Grok,
    Kimi,
    Claude,
    Codex,
}

impl AgentId {
    pub(crate) fn as_str(self) -> &'static str {
        match self {
            AgentId::Grok => "grok",
            AgentId::Kimi => "kimi",
            AgentId::Claude => "claude",
            AgentId::Codex => "codex",
        }
    }

    pub(crate) fn parse(s: &str) -> Option<Self> {
        match s {
            "grok" => Some(AgentId::Grok),
            "kimi" => Some(AgentId::Kimi),
            "claude" => Some(AgentId::Claude),
            "codex" => Some(AgentId::Codex),
            _ => None,
        }
    }
}

#[derive(Clone, Debug, PartialEq, Eq)]
pub(crate) struct SpawnProfile {
    pub command: String,
    pub args: Vec<String>,
}

pub(crate) fn default_spawn_profile(id: AgentId) -> SpawnProfile {
    match id {
        AgentId::Grok => SpawnProfile {
            command: "grok".into(),
            args: vec!["agent".into(), "stdio".into()],
        },
        AgentId::Kimi => SpawnProfile {
            command: "kimi".into(),
            args: vec!["acp".into()],
        },
        AgentId::Claude => SpawnProfile {
            command: "npx".into(),
            args: vec!["-y".into(), "@agentclientprotocol/claude-agent-acp".into()],
        },
        AgentId::Codex => SpawnProfile {
            command: "npx".into(),
            args: vec!["-y".into(), "@agentclientprotocol/codex-acp".into()],
        },
    }
}

#[derive(Default)]
pub(crate) struct AgentPool<T> {
    inner: HashMap<AgentId, T>,
}

impl<T> AgentPool<T> {
    pub(crate) fn new() -> Self {
        Self {
            inner: HashMap::new(),
        }
    }

    pub(crate) fn insert(&mut self, id: AgentId, val: T) -> Option<T> {
        self.inner.insert(id, val)
    }

    pub(crate) fn get(&self, id: AgentId) -> Option<&T> {
        self.inner.get(&id)
    }

    pub(crate) fn get_mut(&mut self, id: AgentId) -> Option<&mut T> {
        self.inner.get_mut(&id)
    }

    pub(crate) fn remove(&mut self, id: AgentId) -> Option<T> {
        self.inner.remove(&id)
    }

    pub(crate) fn contains(&self, id: AgentId) -> bool {
        self.inner.contains_key(&id)
    }

    pub(crate) fn len(&self) -> usize {
        self.inner.len()
    }

    pub(crate) fn is_empty(&self) -> bool {
        self.inner.is_empty()
    }
}
```

In `lib.rs` add only:

```rust
mod agent_host;
```

- [ ] **Step 4: Run tests to verify they pass**

Run: `cargo test --manifest-path src-tauri/Cargo.toml agent_host -- --nocapture`
Expected: PASS (3 tests)

- [ ] **Step 5: Commit** using the isolation dance above. `git add` **only** `src-tauri/src/agent_host.rs` and the isolated `src-tauri/src/lib.rs` that contains the one new `mod` line.

```bash
git commit -m "$(cat <<'EOF'
feat: add AgentId process pool type for ACP children

EOF
)"
```

---
