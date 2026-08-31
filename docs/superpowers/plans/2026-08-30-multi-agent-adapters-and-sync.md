# Multi-Agent Adapters and Live AgentsStore Sync Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Name Grok/Kimi/Claude/Codex as AdminPort adapters (Grok = today’s scan + doctor; others = doctor + empty sessions) and persist AgentsStore sync: skill symlinks and MCP live-file merges, with first-open import that never silent-deletes.

**Architecture:** Spec `docs/superpowers/specs/2026-08-30-multi-agent-acp-workbench-design.md`. ACP spawn pool already exists. This wave extracts admin facades and FS writers. Do not rewrite the ACP stdio loop. Do not implement zip/GitHub marketplace.

**Tech Stack:** TypeScript + Vitest; Rust unit tests. No new deps.

## Global Constraints

- AgentId closed enum. API key wins.
- Never copy-mutate SKILL.md. Dest exists as a real folder → conflict / offer-import, never delete.
- Claude MCP mapping keeps headers (already in mcp-live).
- Grok MCP write prefers `grok mcp add` argv; TOML table is fallback.
- Dirty isolation. Never `git add -A`. TDD. No real user-home writes in tests.

## Follow-on

- Composer selectedAgentId chip
- Phase 0 ACP probes + pin npm
- Native Kimi/Claude/Codex session directory scanners

---

### Task 1: TS adapter session routing

**Files:**
- Create: `src/lib/agent-adapters.ts`
- Create: `src/lib/agent-adapters.test.ts`

**Interfaces:**
- `export function adapterSessions(id: AgentId, grokRows: Array<{ id: string; cwd: string; title: string; updatedAt: string; createdAt: string; numMessages: number }>): import("./admin-port").AdminSession[]`
  - grok → `grokSessionsFromRows(grokRows)`
  - else → `emptySessions(id)`
- `export function allAdapterSessions(grokRows: ...): AdminSession[]` — `unionSessions` of grok + empty kimi/claude/codex

```ts
import { describe, expect, it } from "vitest";
import { adapterSessions, allAdapterSessions } from "./agent-adapters";

describe("adapterSessions", () => {
  const row = { id: "s1", cwd: "/a", title: "A", updatedAt: "2026-01-02", createdAt: "2026-01-01", numMessages: 1 };
  it("only grok returns disk rows this round", () => {
    expect(adapterSessions("grok", [row])[0]?.agentId).toBe("grok");
    expect(adapterSessions("kimi", [row])).toEqual([]);
    expect(adapterSessions("claude", [row])).toEqual([]);
    expect(adapterSessions("codex", [row])).toEqual([]);
    expect(allAdapterSessions([row]).map((s) => s.agentId)).toEqual(["grok"]);
  });
});
```

- [ ] **Step 1–5:** TDD, commit two new files.

```
feat: route AdminPort sessions through four adapters
```

---

### Task 2: Rust adapters module (doctor + session split)

**Files:**
- Create: `src-tauri/src/adapters.rs`
- Isolation: `mod adapters;` on lib.rs

**Interfaces:**
- `pub(crate) fn sessions_for(id: crate::agent_host::AgentId, grok: Vec<String>) -> Vec<String>`
  - Grok returns `grok` unchanged; others return empty vec
  - (ids only — keep it tiny; full SessionSummary stays in lib.rs)
- `pub(crate) fn doctor_homes(user_home: &std::path::Path, grok_home: &std::path::Path) -> [( &'static str, std::path::PathBuf); 4]`
  - grok → grok_home; kimi → user_home/.kimi-code; claude → user_home/.claude; codex → user_home/.codex

```rust
#[test]
fn other_adapters_have_no_sessions_yet() {
    use crate::agent_host::AgentId;
    let grok = vec!["s1".into()];
    assert_eq!(sessions_for(AgentId::Grok, grok.clone()), grok);
    assert!(sessions_for(AgentId::Kimi, grok.clone()).is_empty());
    assert!(sessions_for(AgentId::Claude, grok.clone()).is_empty());
    assert!(sessions_for(AgentId::Codex, grok).is_empty());
    let homes = doctor_homes(Path::new("/Users/me"), Path::new("/Users/me/.grok"));
    assert_eq!(homes[0], ("grok", PathBuf::from("/Users/me/.grok")));
    assert_eq!(homes[1], ("kimi", PathBuf::from("/Users/me/.kimi-code")));
    assert_eq!(homes[2], ("claude", PathBuf::from("/Users/me/.claude")));
    assert_eq!(homes[3], ("codex", PathBuf::from("/Users/me/.codex")));
}
```

Isolation dance for `mod adapters;`. Do **not** rewrite `doctor_all` in this task (follow-on can call `doctor_homes`).

```
feat: add AdminPort adapter session and home split
```

---

### Task 3: Live skill symlink apply (Rust)

**Files:**
- Create: `src-tauri/src/skill_sync.rs`
- Isolation: `mod skill_sync;`

Mirror TS `applySkillLink` on real temp dirs:

- `pub(crate) fn apply_skill_link(canonical: &Path, dest: &Path, enabled: bool) -> Result<&'static str, String>`
  - enabled + !dest.exists → mkdir parent, `std::os::unix::fs::symlink` (cfg unix; on non-unix return Err("symlink")) → `"linked"`
  - enabled + dest is symlink to canonical → `"noop"`
  - enabled + dest is symlink to other → replace → `"linked"`
  - enabled + dest exists and is not symlink → `"conflict"` (do not delete)
  - !enabled + dest is symlink to canonical → unlink → `"unlinked"`
  - !enabled + dest exists otherwise → `"kept"`
  - !enabled + !exists → `"noop"`

Tests use temp dirs. Skip if not unix with `#[cfg(unix)]`.

```
feat: symlink skills into CLI homes without deleting folders
```

---

### Task 4: First-open MCP catalog persist helper (TS)

**Files:**
- Create: `src/lib/agents-store-io.ts`
- Create: `src/lib/agents-store-io.test.ts`

In-memory FS (like skill-link):

```ts
export type StoreFs = {
  read(path: string): string | null;
  write(path: string, text: string): void;
  exists(path: string): boolean;
};

export function loadOrInitMcpJson(fs: StoreFs, mcpPath: string, liveImports: McpServer[]): { catalog: McpServer[]; conflicts: string[] }
```

- If file missing or invalid → start `[]`
- Parse with `parseMcpJson`
- `firstOpenMcpImport(canonical, liveImports)`
- Write `stringifyMcpJson(next.catalog)` back
- Return catalog + conflicts
- Never delete the file

Need `stringifyMcpJson` from agents-store persist helpers — check `src/lib/agents-store.ts` / persist file. If stringify lives elsewhere, import it. If missing, write `{ servers: catalog }` via `JSON.stringify`.

```ts
it("unions live servers into empty store without dropping conflicts", () => {
  const mem = new Map<string, string>();
  const fs: StoreFs = {
    read: (p) => mem.get(p) ?? null,
    write: (p, t) => { mem.set(p, t); },
    exists: (p) => mem.has(p),
  };
  const live = [
    { name: "git", transport: "stdio" as const, commandOrUrl: "uvx" },
    { name: "docs", transport: "http" as const, commandOrUrl: "https://x" },
  ];
  const first = loadOrInitMcpJson(fs, "/mcp.json", live);
  expect(first.catalog.map((s) => s.name).sort()).toEqual(["docs", "git"]);
  const second = loadOrInitMcpJson(fs, "/mcp.json", [{ name: "git", transport: "stdio", commandOrUrl: "npx" }]);
  expect(second.conflicts).toEqual(["git"]);
  expect(second.catalog.find((s) => s.name === "git")?.commandOrUrl).toBe("uvx");
});
```

```
feat: first-open MCP import keeps canonical on conflict
```

---

### Task 5: MCP live doc apply helper (TS)

**Files:**
- Create: `src/lib/mcp-sync-apply.ts`
- Create: `src/lib/mcp-sync-apply.test.ts`

```ts
export function applyMcpToClaudeDoc(doc: unknown, enabled: McpServer[]): Record<string, unknown>
export function applyMcpToKimiDoc(doc: unknown, enabled: McpServer[]): { servers: McpServer[] }
export function applyMcpToCodexTables(existing: Record<string, import("./mcp-live").CodexMcpEntry>, enabled: McpServer[]): Record<string, CodexMcpEntry>
export function applyMcpToGrokTables(...) // alias mergeGrokMcpTables
```

These are thin wrappers over existing merge* that **replace only enabled names**? Spec: merge enabled servers into live file; disable removes that name only.

```ts
export function syncMcpLive<T>(
  kind: "claude" | "kimi" | "codex" | "grok",
  doc: T,
  enabled: McpServer[],
  disabledNames: string[],
): T
```

Too generic. Prefer four functions using existing merge/remove:

```ts
export function syncClaudeLive(doc: unknown, enabled: McpServer[], disabledNames: string[]): Record<string, unknown> {
  let next = mergeClaudeMcpDoc(doc, enabled);
  for (const name of disabledNames) next = removeClaudeMcpServer(next, name);
  return next;
}
```

Same for kimi / codex / grok (grok uses mergeGrokMcpTables / removeGrokMcpServer).

```
feat: sync MCP catalog into each CLI live document
```

---
