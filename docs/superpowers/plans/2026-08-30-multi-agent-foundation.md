# Multi-Agent Workbench Foundation Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Land the shared types and pure logic for a multi-agent ACP workbench: `AgentId`/`SessionRef`, subscription-vs-API `AuthKind`, capability-gated RPC allowlist, token brand filter, and `~/.agents` Skills/MCP catalog — without spawning new CLIs or rewriting the live session loop.

**Architecture:** Spec is `docs/superpowers/specs/2026-08-30-multi-agent-acp-workbench-design.md`. This plan is Wave-foundation only. Later plans own process pool, live adapters, hub UI, and usage overlay chrome. New TS modules are small and dependency-free so they can land beside the existing dirty P0–P2 tree.

**Tech Stack:** TypeScript + Vitest (`npm test`), Rust tests in `src-tauri/src/lib.rs` (`cargo test --manifest-path src-tauri/Cargo.toml`). No new npm/cargo dependencies.

## Global Constraints

- Spec path: `docs/superpowers/specs/2026-08-30-multi-agent-acp-workbench-design.md`. Follow locked product decisions in that file.
- `AgentId` closed enum: `"grok" | "kimi" | "claude" | "codex"` only.
- Do not spawn Claude/Codex/Kimi processes in this plan. Do not change `start_agent` argv.
- Do not implement plugins, plugin marketplace, or imagine/video providers.
- Do not read `~/.cc-switch/cc-switch.db`. Canonical skills/MCP live under `~/.agents`.
- Usage ring: `authKind === "subscription"` only. API key wins over subscription when both exist.
- Leave existing dirty working-tree files unless this task’s Files list includes them. `git add` only files this task owns. Never `git add -A`.
- Tests: `npm test -- src/lib/<file>.test.ts` for TS; `cargo test --manifest-path src-tauri/Cargo.toml rpc_allowlist_tests -- --nocapture` for Rust allowlist. TDD: failing test first.
- Chinese UI copy is out of scope except slash hint already in `commands.ts`.
- `rpc_payload_allowed` without extra args must keep today’s Grok behavior (`session/set_mode` denied, `_x.ai/*` allowed).

## Follow-on plans (do not execute in this file)

- Process pool + `start_agent(agentId)` + tagged ACP events
- Phase 0 live ACP probes
- AgentsStore FS sync (symlinks + live MCP file writers) + hub UI (drop plugins tab)
- Kimi / Claude / Codex adapters
- Usage overlay brand switcher chrome + subscription quota fetch

---

### Task 1: AgentId and SessionRef

**Files:**
- Create: `src/lib/agent-id.ts`
- Create: `src/lib/agent-id.test.ts`

**Interfaces:**
- Consumes: nothing
- Produces:
  - `export type AgentId = "grok" | "kimi" | "claude" | "codex"`
  - `export const AGENT_IDS: readonly AgentId[]`
  - `export function isAgentId(value: string): value is AgentId`
  - `export type SessionRef = { agentId: AgentId; sessionId: string }`
  - `export function sessionRefKey(ref: SessionRef): string` → `"grok/abc"`
  - `export function parseSessionRefKey(key: string): SessionRef | null` — missing slash migrates to `{ agentId: "grok", sessionId: key }`

- [ ] **Step 1: Write the failing test**

```ts
import { describe, expect, it } from "vitest";
import {
  AGENT_IDS,
  isAgentId,
  parseSessionRefKey,
  sessionRefKey,
} from "./agent-id";

describe("AgentId", () => {
  it("accepts the four closed ids", () => {
    expect([...AGENT_IDS]).toEqual(["grok", "kimi", "claude", "codex"]);
    expect(isAgentId("grok")).toBe(true);
    expect(isAgentId("kimi")).toBe(true);
    expect(isAgentId("claude")).toBe(true);
    expect(isAgentId("codex")).toBe(true);
    expect(isAgentId("gemini")).toBe(false);
    expect(isAgentId("Grok")).toBe(false);
  });
});

describe("SessionRef", () => {
  it("round-trips agentId/sessionId", () => {
    expect(sessionRefKey({ agentId: "claude", sessionId: "s1" })).toBe("claude/s1");
    expect(parseSessionRefKey("claude/s1")).toEqual({ agentId: "claude", sessionId: "s1" });
  });

  it("keeps session ids that contain slashes after the first separator", () => {
    expect(parseSessionRefKey("kimi/wd_a/sess")).toEqual({
      agentId: "kimi",
      sessionId: "wd_a/sess",
    });
  });

  it("treats legacy bare grok ids as grok/<id>", () => {
    expect(parseSessionRefKey("abc-123")).toEqual({ agentId: "grok", sessionId: "abc-123" });
  });

  it("rejects empty and unknown agent prefixes", () => {
    expect(parseSessionRefKey("")).toBeNull();
    expect(parseSessionRefKey("gemini/x")).toBeNull();
    expect(parseSessionRefKey("grok/")).toBeNull();
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npm test -- src/lib/agent-id.test.ts`
Expected: FAIL (module not found)

- [ ] **Step 3: Write minimal implementation**

```ts
export type AgentId = "grok" | "kimi" | "claude" | "codex";

export const AGENT_IDS = ["grok", "kimi", "claude", "codex"] as const;

export function isAgentId(value: string): value is AgentId {
  return (AGENT_IDS as readonly string[]).includes(value);
}

export type SessionRef = { agentId: AgentId; sessionId: string };

export function sessionRefKey(ref: SessionRef): string {
  return `${ref.agentId}/${ref.sessionId}`;
}

export function parseSessionRefKey(key: string): SessionRef | null {
  const trimmed = key.trim();
  if (!trimmed) return null;
  const slash = trimmed.indexOf("/");
  if (slash < 0) {
    return { agentId: "grok", sessionId: trimmed };
  }
  const agent = trimmed.slice(0, slash);
  const sessionId = trimmed.slice(slash + 1);
  if (!sessionId || !isAgentId(agent)) return null;
  return { agentId: agent, sessionId };
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npm test -- src/lib/agent-id.test.ts`
Expected: PASS

- [ ] **Step 5: Commit**

```bash
git add src/lib/agent-id.ts src/lib/agent-id.test.ts
git commit -m "$(cat <<'EOF'
feat: add AgentId and SessionRef keys for multi-agent sessions

EOF
)"
```

---

### Task 2: AuthKind classification and usage-ring gate

**Files:**
- Create: `src/lib/auth-kind.ts`
- Create: `src/lib/auth-kind.test.ts`

**Interfaces:**
- Consumes: nothing
- Produces:
  - `export type AuthKind = "subscription" | "api" | "none"`
  - `export type AuthEvidence = { hasSubscriptionSession: boolean; hasApiKey: boolean }`
  - `export function classifyAuthKind(evidence: AuthEvidence): AuthKind`
  - `export function shouldShowUsageRing(kind: AuthKind): boolean`

Locked rule: if both subscription session and API key exist, return `"api"`. Ring only for `"subscription"`.

- [ ] **Step 1: Write the failing test**

```ts
import { describe, expect, it } from "vitest";
import { classifyAuthKind, shouldShowUsageRing } from "./auth-kind";

describe("classifyAuthKind", () => {
  it("returns none when neither login nor key exists", () => {
    expect(classifyAuthKind({ hasSubscriptionSession: false, hasApiKey: false })).toBe("none");
  });

  it("returns subscription when only native login exists", () => {
    expect(classifyAuthKind({ hasSubscriptionSession: true, hasApiKey: false })).toBe("subscription");
  });

  it("returns api when only a key exists", () => {
    expect(classifyAuthKind({ hasSubscriptionSession: false, hasApiKey: true })).toBe("api");
  });

  it("lets the API key win when both exist", () => {
    expect(classifyAuthKind({ hasSubscriptionSession: true, hasApiKey: true })).toBe("api");
  });
});

describe("shouldShowUsageRing", () => {
  it("shows the ring only for subscription", () => {
    expect(shouldShowUsageRing("subscription")).toBe(true);
    expect(shouldShowUsageRing("api")).toBe(false);
    expect(shouldShowUsageRing("none")).toBe(false);
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npm test -- src/lib/auth-kind.test.ts`
Expected: FAIL (module not found)

- [ ] **Step 3: Write minimal implementation**

```ts
export type AuthKind = "subscription" | "api" | "none";

export type AuthEvidence = {
  hasSubscriptionSession: boolean;
  hasApiKey: boolean;
};

export function classifyAuthKind(evidence: AuthEvidence): AuthKind {
  if (evidence.hasApiKey) return "api";
  if (evidence.hasSubscriptionSession) return "subscription";
  return "none";
}

export function shouldShowUsageRing(kind: AuthKind): boolean {
  return kind === "subscription";
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npm test -- src/lib/auth-kind.test.ts`
Expected: PASS

- [ ] **Step 5: Commit**

```bash
git add src/lib/auth-kind.ts src/lib/auth-kind.test.ts
git commit -m "$(cat <<'EOF'
feat: classify CLI auth as subscription, api, or none

EOF
)"
```

---

### Task 3: Capability-gated RPC allowlist

**Files:**
- Modify: `src-tauri/src/lib.rs` (`ALLOWED_RPC_METHODS`, `rpc_payload_allowed`, `rpc_allowlist_tests`)

**Interfaces:**
- Consumes: existing `rpc_payload_allowed(payload: &Value) -> bool` used by `send_raw`
- Produces:
  - `pub(crate) struct AgentRpcCaps { pub load_session: bool, pub list_sessions: bool, pub set_mode: bool, pub set_config_option: bool, pub authenticate: bool, pub vendor_xai: bool }`
  - `impl AgentRpcCaps { pub fn grok_legacy() -> Self }` — load_session true, list/set_mode/set_config/authenticate false, vendor_xai true
  - `pub(crate) fn rpc_payload_allowed_for(payload: &Value, caps: &AgentRpcCaps) -> bool`
  - `rpc_payload_allowed` delegates to `rpc_payload_allowed_for(payload, &AgentRpcCaps::grok_legacy())`

Always allow: `initialize`, `session/new`, `session/prompt`, `session/cancel`, and JSON-RPC responses (`id` + result/error).
If `load_session`: also `session/load`, `session/resume`.
If `list_sessions`: `session/list`.
If `set_mode`: `session/set_mode`.
If `set_config_option`: `session/set_config_option` and `session/set_model`.
If `authenticate`: `authenticate`.
If `vendor_xai`: methods that start with `_x.ai/` and have a character after the slash (keep rejecting `"_x.ai"`).

- [ ] **Step 1: Write the failing tests** (add to `rpc_allowlist_tests`)

Keep existing tests. Add:

```rust
    #[test]
    fn rpc_payload_allowed_for_kimi_caps_allows_session_config() {
        let caps = AgentRpcCaps {
            load_session: true,
            list_sessions: true,
            set_mode: true,
            set_config_option: true,
            authenticate: true,
            vendor_xai: false,
        };
        assert!(rpc_payload_allowed_for(
            &json!({ "method": "session/set_mode" }),
            &caps
        ));
        assert!(rpc_payload_allowed_for(
            &json!({ "method": "session/set_config_option" }),
            &caps
        ));
        assert!(rpc_payload_allowed_for(
            &json!({ "method": "session/set_model" }),
            &caps
        ));
        assert!(rpc_payload_allowed_for(
            &json!({ "method": "session/list" }),
            &caps
        ));
        assert!(rpc_payload_allowed_for(
            &json!({ "method": "authenticate" }),
            &caps
        ));
        assert!(!rpc_payload_allowed_for(
            &json!({ "method": "_x.ai/billing" }),
            &caps
        ));
    }

    #[test]
    fn grok_legacy_still_rejects_set_mode() {
        assert!(!rpc_payload_allowed(&json!({ "method": "session/set_mode" })));
        assert!(!rpc_payload_allowed(&json!({ "method": "authenticate" })));
        assert!(!rpc_payload_allowed(&json!({ "method": "session/list" })));
    }
```

- [ ] **Step 2: Run tests to verify new ones fail**

Run: `cargo test --manifest-path src-tauri/Cargo.toml rpc_payload_allowed_for_kimi_caps_allows_session_config grok_legacy_still_rejects_set_mode -- --nocapture`
Expected: FAIL compiling (`AgentRpcCaps` / `rpc_payload_allowed_for` not found) or FAIL assert

- [ ] **Step 3: Write minimal implementation**

Replace `rpc_payload_allowed` and the const list with:

```rust
#[derive(Clone, Copy)]
pub(crate) struct AgentRpcCaps {
    pub load_session: bool,
    pub list_sessions: bool,
    pub set_mode: bool,
    pub set_config_option: bool,
    pub authenticate: bool,
    pub vendor_xai: bool,
}

impl AgentRpcCaps {
    pub fn grok_legacy() -> Self {
        Self {
            load_session: true,
            list_sessions: false,
            set_mode: false,
            set_config_option: false,
            authenticate: false,
            vendor_xai: true,
        }
    }
}

const ALWAYS_RPC_METHODS: &[&str] = &[
    "initialize",
    "session/new",
    "session/prompt",
    "session/cancel",
];

pub(crate) fn rpc_payload_allowed(payload: &Value) -> bool {
    rpc_payload_allowed_for(payload, &AgentRpcCaps::grok_legacy())
}

pub(crate) fn rpc_payload_allowed_for(payload: &Value, caps: &AgentRpcCaps) -> bool {
    let Some(obj) = payload.as_object() else {
        return false;
    };
    let method = obj.get("method");
    let method_absent = method.is_none() || method == Some(&Value::Null);
    if method_absent {
        return obj.contains_key("id") && (obj.contains_key("result") || obj.contains_key("error"));
    }
    let Some(name) = method.and_then(Value::as_str) else {
        return false;
    };
    if ALWAYS_RPC_METHODS.contains(&name) {
        return true;
    }
    if caps.load_session && matches!(name, "session/load" | "session/resume") {
        return true;
    }
    if caps.list_sessions && name == "session/list" {
        return true;
    }
    if caps.set_mode && name == "session/set_mode" {
        return true;
    }
    if caps.set_config_option && matches!(name, "session/set_config_option" | "session/set_model") {
        return true;
    }
    if caps.authenticate && name == "authenticate" {
        return true;
    }
    if caps.vendor_xai && name.starts_with("_x.ai/") {
        return true;
    }
    false
}
```

Delete `ALLOWED_RPC_METHODS`. Keep `send_raw` calling `rpc_payload_allowed`.

- [ ] **Step 4: Run tests to verify they pass**

Run: `cargo test --manifest-path src-tauri/Cargo.toml rpc_allowlist_tests`
Expected: PASS (including existing listed-methods / xai / reject-unknown tests)

- [ ] **Step 5: Commit**

```bash
git add src-tauri/src/lib.rs
git commit -m "$(cat <<'EOF'
feat: gate ACP RPC methods on negotiated agent capabilities

EOF
)"
```

---

### Task 4: Token turns branded by AgentId

**Files:**
- Modify: `src/lib/token-usage.ts`
- Modify: `src/lib/token-usage.test.ts`

**Interfaces:**
- Consumes: `AgentId` from `./agent-id`
- Produces: `TokenTurn.agentId?: AgentId`; `TurnFilter.agentId?: AgentId | "all"`; `filterTurns` drops rows when filter is a concrete `AgentId` and `row.agentId` differs (missing `row.agentId` counts as `"grok"`). `"all"` or omitted filter.agentId keeps all brands.

Do not change `parseTurnUsage` shape except adding optional `agentId` passthrough via meta:

```ts
meta?: { at?: number; cwd?: string; agentId?: AgentId }
```

If `meta.agentId` is set, copy it onto the returned turn.

- [ ] **Step 1: Write the failing tests** (append to `token-usage.test.ts`)

```ts
import { parseSessionRefKey } from "./agent-id"; // only if needed — do not import if unused
import type { AgentId } from "./agent-id";

describe("filterTurns agent brand", () => {
  const grok = turn({ agentId: "grok" as AgentId, total: 10 });
  const claude = turn({ agentId: "claude" as AgentId, total: 20, model: "opus" });
  const legacy = turn({ total: 30 }); // no agentId

  it("treats missing agentId as grok", () => {
    expect(filterTurns([grok, claude, legacy], { days: 0, agentId: "grok" }).map((t) => t.total)).toEqual([10, 30]);
  });

  it("filters a single brand", () => {
    expect(filterTurns([grok, claude, legacy], { days: 0, agentId: "claude" }).map((t) => t.total)).toEqual([20]);
  });

  it("keeps every brand when agentId is all or omitted", () => {
    expect(filterTurns([grok, claude], { days: 0 }).length).toBe(2);
    expect(filterTurns([grok, claude], { days: 0, agentId: "all" }).length).toBe(2);
  });
});

describe("parseTurnUsage agentId meta", () => {
  it("stamps agentId from meta", () => {
    const row = parseTurnUsage(
      {
        sessionUpdate: "turn_completed",
        usage: { inputTokens: 1, outputTokens: 1, totalTokens: 2 },
      },
      { at: 1, cwd: "/w", agentId: "kimi" },
    );
    expect(row?.agentId).toBe("kimi");
  });
});
```

Fix imports at top of `token-usage.test.ts`: add `type AgentId` from `./agent-id`. Existing `parseTurnUsage` equality test must still pass — new optional field `agentId` is `undefined` when meta omits it. Update that expected object only if the test is strict-equal and fails; prefer leaving `agentId` undefined so the old object still matches.

- [ ] **Step 2: Run test to verify it fails**

Run: `npm test -- src/lib/token-usage.test.ts`
Expected: FAIL (unknown `agentId` on type / filter ignores brand)

- [ ] **Step 3: Write minimal implementation**

In `src/lib/token-usage.ts`:

```ts
import type { AgentId } from "./agent-id";
```

Add to `TokenTurn`: `agentId?: AgentId`
Add to `TurnFilter`: `agentId?: AgentId | "all"`
Extend `parseTurnUsage` meta and set `agentId: meta?.agentId` on the returned object when present.
In `filterTurns`, after cwd check:

```ts
    const brand = row.agentId ?? "grok";
    if (opts.agentId && opts.agentId !== "all" && brand !== opts.agentId) return false;
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npm test -- src/lib/token-usage.test.ts`
Expected: PASS (including existing parseTurnUsage strict equality)

- [ ] **Step 5: Commit**

```bash
git add src/lib/token-usage.ts src/lib/token-usage.test.ts
git commit -m "$(cat <<'EOF'
feat: filter token usage turns by CLI brand

EOF
)"
```

---

### Task 5: AgentsStore catalog (paths, skills, MCP, sync matrix)

**Files:**
- Create: `src/lib/agents-store.ts`
- Create: `src/lib/agents-store.test.ts`

**Interfaces:**
- Consumes: `AgentId`, `AGENT_IDS` from `./agent-id`
- Produces:

```ts
export type McpTransport = "stdio" | "http" | "sse";
export type McpServer = {
  name: string;
  transport: McpTransport;
  commandOrUrl?: string;
  args?: string[];
  env?: string[];
  headers?: string[];
};
export type SyncFlags = Record<AgentId, boolean>;
export type AgentsSync = {
  skills: Record<string, SyncFlags>;
  mcp: Record<string, SyncFlags>;
};

export function defaultAgentsHome(home: string): string; // `${home}/.agents`
export function skillDir(agentsHome: string, name: string): string; // `${agentsHome}/skills/${name}`
export function mcpJsonPath(agentsHome: string): string;
export function syncJsonPath(agentsHome: string): string;
export function skillNameOk(name: string): boolean; // lowercase start; only [a-z0-9-]; non-empty
export function defaultSyncFlags(): SyncFlags; // all four true
export function mergeMcpCatalog(canonical: McpServer[], imported: McpServer[]): McpServer[];
  // union by name; canonical wins on conflict (same name, keep canonical entry)
export function mcpServersForAgent(catalog: McpServer[], sync: AgentsSync, agentId: AgentId): McpServer[];
  // include server if sync.mcp[name] is missing (default on) or flags[agentId] === true
export function parseMcpJson(raw: unknown): McpServer[];
  // { servers: McpServer[] } or []; ignore malformed items
```

No filesystem I/O in this task.

- [ ] **Step 1: Write the failing test**

```ts
import { describe, expect, it } from "vitest";
import {
  defaultAgentsHome,
  defaultSyncFlags,
  mcpJsonPath,
  mcpServersForAgent,
  mergeMcpCatalog,
  parseMcpJson,
  skillDir,
  skillNameOk,
  syncJsonPath,
  type McpServer,
} from "./agents-store";

describe("agents-store paths", () => {
  it("places skills and mcp under ~/.agents", () => {
    const root = defaultAgentsHome("/Users/me");
    expect(root).toBe("/Users/me/.agents");
    expect(skillDir(root, "pdf")).toBe("/Users/me/.agents/skills/pdf");
    expect(mcpJsonPath(root)).toBe("/Users/me/.agents/mcp.json");
    expect(syncJsonPath(root)).toBe("/Users/me/.agents/sync.json");
  });
});

describe("skillNameOk", () => {
  it("matches grok skill names", () => {
    expect(skillNameOk("pdf-review")).toBe(true);
    expect(skillNameOk("a")).toBe(true);
    expect(skillNameOk("Pdf")).toBe(false);
    expect(skillNameOk("")).toBe(false);
    expect(skillNameOk("-x")).toBe(false);
    expect(skillNameOk("x_y")).toBe(false);
  });
});

describe("mcp catalog", () => {
  const stdio: McpServer = { name: "git", transport: "stdio", commandOrUrl: "uvx", args: ["mcp-git"] };
  const http: McpServer = { name: "docs", transport: "http", commandOrUrl: "https://example.com" };

  it("lets canonical win on name conflict and unions the rest", () => {
    const imported: McpServer = { name: "git", transport: "http", commandOrUrl: "https://other" };
    expect(mergeMcpCatalog([stdio], [imported, http])).toEqual([stdio, http]);
  });

  it("defaults a missing sync flag to enabled", () => {
    const catalog = [stdio, http];
    const sync = { skills: {}, mcp: { git: { grok: true, kimi: false, claude: true, codex: true } } };
    expect(mcpServersForAgent(catalog, sync, "kimi").map((s) => s.name)).toEqual(["docs"]);
    expect(mcpServersForAgent(catalog, sync, "grok").map((s) => s.name)).toEqual(["git", "docs"]);
  });

  it("parses { servers: [] }", () => {
    expect(parseMcpJson({ servers: [stdio] })).toEqual([stdio]);
    expect(parseMcpJson(null)).toEqual([]);
    expect(parseMcpJson({ servers: [{ name: "" }] })).toEqual([]);
  });
});

describe("defaultSyncFlags", () => {
  it("enables every AgentId", () => {
    expect(defaultSyncFlags()).toEqual({ grok: true, kimi: true, claude: true, codex: true });
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npm test -- src/lib/agents-store.test.ts`
Expected: FAIL (module not found)

- [ ] **Step 3: Write minimal implementation**

```ts
import type { AgentId } from "./agent-id";

export type McpTransport = "stdio" | "http" | "sse";

export type McpServer = {
  name: string;
  transport: McpTransport;
  commandOrUrl?: string;
  args?: string[];
  env?: string[];
  headers?: string[];
};

export type SyncFlags = Record<AgentId, boolean>;

export type AgentsSync = {
  skills: Record<string, SyncFlags>;
  mcp: Record<string, SyncFlags>;
};

export function defaultAgentsHome(home: string): string {
  return `${home.replace(/\/$/, "")}/.agents`;
}

export function skillDir(agentsHome: string, name: string): string {
  return `${agentsHome}/skills/${name}`;
}

export function mcpJsonPath(agentsHome: string): string {
  return `${agentsHome}/mcp.json`;
}

export function syncJsonPath(agentsHome: string): string {
  return `${agentsHome}/sync.json`;
}

export function skillNameOk(name: string): boolean {
  return /^[a-z][a-z0-9-]*$/.test(name);
}

export function defaultSyncFlags(): SyncFlags {
  return { grok: true, kimi: true, claude: true, codex: true };
}

export function mergeMcpCatalog(canonical: McpServer[], imported: McpServer[]): McpServer[] {
  const out = [...canonical];
  const seen = new Set(canonical.map((s) => s.name));
  for (const row of imported) {
    if (seen.has(row.name)) continue;
    seen.add(row.name);
    out.push(row);
  }
  return out;
}

export function mcpServersForAgent(
  catalog: McpServer[],
  sync: AgentsSync,
  agentId: AgentId,
): McpServer[] {
  return catalog.filter((row) => {
    const flags = sync.mcp[row.name];
    if (!flags) return true;
    return flags[agentId] === true;
  });
}

function asStringArray(v: unknown): string[] | undefined {
  if (!Array.isArray(v) || !v.every((x) => typeof x === "string")) return undefined;
  return v as string[];
}

export function parseMcpJson(raw: unknown): McpServer[] {
  if (!raw || typeof raw !== "object" || Array.isArray(raw)) return [];
  const servers = (raw as { servers?: unknown }).servers;
  if (!Array.isArray(servers)) return [];
  const out: McpServer[] = [];
  for (const item of servers) {
    if (!item || typeof item !== "object" || Array.isArray(item)) continue;
    const rec = item as Record<string, unknown>;
    const name = typeof rec.name === "string" ? rec.name.trim() : "";
    const transport = rec.transport;
    if (!name || (transport !== "stdio" && transport !== "http" && transport !== "sse")) continue;
    const row: McpServer = { name, transport };
    if (typeof rec.commandOrUrl === "string") row.commandOrUrl = rec.commandOrUrl;
    const args = asStringArray(rec.args);
    if (args) row.args = args;
    const env = asStringArray(rec.env);
    if (env) row.env = env;
    const headers = asStringArray(rec.headers);
    if (headers) row.headers = headers;
    out.push(row);
  }
  return out;
}
```

Do not import `AGENT_IDS`.

- [ ] **Step 4: Run test to verify it passes**

Run: `npm test -- src/lib/agents-store.test.ts`
Expected: PASS

- [ ] **Step 5: Commit**

```bash
git add src/lib/agents-store.ts src/lib/agents-store.test.ts
git commit -m "$(cat <<'EOF'
feat: add ~/.agents skills and MCP catalog helpers

EOF
)"
```

---

### Task 6: Alias /plugins to the skills hub tab

**Files:**
- Modify: `src/lib/commands.ts` (the `/plugins` entry in `SLASH_COMMANDS` only)
- Modify: `src/lib/commands.test.ts`

**Interfaces:**
- Consumes: existing `CommandDef` / `HubTab`
- Produces: `/plugins` has `local: "hub"` and `hubTab: "skills"` (not `"plugins"`). Do not remove `"plugins"` from the `HubTab` union in this task (ExtensionsHub still uses it; a later plan drops the tab).

- [ ] **Step 1: Write the failing test** (append inside `filterCommands` describe)

```ts
  it("aliases /plugins to the skills hub tab", () => {
    const plugins = SLASH_COMMANDS.find((c) => c.name === "/plugins");
    expect(plugins?.local).toBe("hub");
    expect(plugins?.hubTab).toBe("skills");
  });
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npm test -- src/lib/commands.test.ts`
Expected: FAIL (`hubTab` is `"plugins"`)

- [ ] **Step 3: Write minimal implementation**

Change the `/plugins` row to `{ name: "/plugins", hint: "技能", local: "hub", hubTab: "skills" }`.

- [ ] **Step 4: Run test to verify it passes**

Run: `npm test -- src/lib/commands.test.ts`
Expected: PASS

- [ ] **Step 5: Commit**

```bash
git add src/lib/commands.ts src/lib/commands.test.ts
git commit -m "$(cat <<'EOF'
feat: route /plugins to the skills hub instead of plugins

EOF
)"
```
