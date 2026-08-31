# Multi-Agent MCP Store Sync and Permission Agent Binding Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Hub MCP edits `~/.agents/mcp.json` (not only `grok mcp add`) and syncs into Claude/Kimi JSON plus Grok/Codex TOML. Permission replies go to the ACP child that asked (`agentId` on the tagged event).

**Architecture:** Spec `docs/superpowers/specs/2026-08-30-multi-agent-acp-workbench-design.md`. Merge helpers already exist in `mcp-sync-apply.ts`. This wave adds live paths, TOML table I/O, allowlisted home-file read/write, hub wiring, and tagged permission replies.

**Tech Stack:** TypeScript + Vitest; Rust `toml_edit` (already a crate dep). No new dependencies.

## Global Constraints

- AgentId closed enum. Canonical MCP store is `~/.agents/mcp.json`. Never read `~/.cc-switch`.
- Disable for one CLI removes that server from **that** live file only. Canonical keeps the definition.
- First-open import already exists; do not silent-delete live folders/files.
- Grok still **also** may call `grok mcp add` after catalog write (spec prefers argv). File TOML is the fallback write.
- Codex live table key is `mcp_servers`. Grok fallback table key is also `mcp_servers` (same shape as Codex helpers).
- Dirty isolation. Never `git add -A`. TDD. Tests must not write the real user home.

## Follow-on

- Native Kimi/Claude/Codex session directory scanners (Phase 0)
- agents.toml / inbox rename / npm pins

---

### Task 1: Live MCP paths + catalog upsert

**Files:**
- Create: `src/lib/mcp-live-paths.ts`
- Create: `src/lib/mcp-live-paths.test.ts`

**Interfaces:**
- `export function liveMcpPath(home: string, id: AgentId): string`
  - grok → `{home}/.grok/config.toml`
  - kimi → `{home}/.kimi-code/mcp.json`
  - claude → `{home}/.claude.json`
  - codex → `{home}/.codex/config.toml`
- `export function agentsMcpPath(agentsHome: string): string` — delegate `mcpJsonPath`
- `export function upsertMcpCatalog(catalog: McpServer[], server: McpServer): McpServer[]` — replace same name, else append
- `export function removeMcpCatalog(catalog: McpServer[], name: string): McpServer[]`

```ts
import { describe, expect, it } from "vitest";
import { liveMcpPath, removeMcpCatalog, upsertMcpCatalog } from "./mcp-live-paths";

describe("live MCP paths and catalog", () => {
  it("maps each CLI live file and upserts by name", () => {
    expect(liveMcpPath("/Users/me", "grok")).toBe("/Users/me/.grok/config.toml");
    expect(liveMcpPath("/Users/me/", "kimi")).toBe("/Users/me/.kimi-code/mcp.json");
    expect(liveMcpPath("/Users/me", "claude")).toBe("/Users/me/.claude.json");
    expect(liveMcpPath("/Users/me", "codex")).toBe("/Users/me/.codex/config.toml");
    const git = { name: "git", transport: "stdio" as const, commandOrUrl: "uvx" };
    expect(upsertMcpCatalog([{ name: "git", transport: "stdio", commandOrUrl: "old" }], git)).toEqual([git]);
    expect(removeMcpCatalog([git, { name: "docs", transport: "http", commandOrUrl: "https://x" }], "git")).toEqual([
      { name: "docs", transport: "http", commandOrUrl: "https://x" },
    ]);
  });
});
```

- [ ] **Step 1–5:** TDD, commit two new files.

```
feat: map CLI MCP live paths and upsert the agents catalog
```

---

### Task 2: TOML mcp_servers merge (Rust)

**Files:**
- Create: `src-tauri/src/mcp_toml.rs`
- Isolation: `mod mcp_toml;` on lib.rs

**Interfaces:**
- `pub(crate) fn upsert_mcp_servers_toml(text: &str, name: &str, command: &str, args: &[String]) -> String`
  - Parse with `toml_edit::DocumentMut` (empty text → default)
  - Ensure table `mcp_servers.<name>` (dotted: `doc["mcp_servers"][name]`)
  - Set `command` and `args` array; leave other keys in that table
  - Return `doc.to_string()`
- `pub(crate) fn remove_mcp_servers_toml(text: &str, name: &str) -> String`
  - Remove `mcp_servers.<name>` if present; keep neighbors

```rust
#[test]
fn upserts_and_removes_mcp_servers_table() {
    let next = upsert_mcp_servers_toml("", "git", "uvx", &["mcp-git".into()]);
    assert!(next.contains("mcp_servers"));
    assert!(next.contains("git"));
    assert!(next.contains("uvx"));
    let kept = upsert_mcp_servers_toml(&next, "docs", "npx", &[]);
    assert!(kept.contains("git"));
    assert!(kept.contains("docs"));
    let gone = remove_mcp_servers_toml(&kept, "git");
    assert!(!gone.contains("git") || gone.contains("docs"));
    assert!(gone.contains("docs"));
}
```

- [ ] Isolation dance for `mod mcp_toml;`
- [ ] Commit `mcp_toml.rs` + one-line lib.rs

```
feat: merge Codex/Grok MCP servers in TOML
```

---

### Task 3: Allowlisted agents-file read/write + sync command

**Files:**
- Create: `src-tauri/src/agents_files.rs`
- Isolation: `mod agents_files;` + two commands on lib.rs

**Interfaces:**
- `pub(crate) fn agents_file_path(user_home: &Path, agents_home: &Path, kind: &str) -> Option<PathBuf>`
  - `mcp-json` → `agents_home/mcp.json`
  - `sync-json` → `agents_home/sync.json`
  - `claude-json` → `user_home/.claude.json`
  - `kimi-mcp` → `user_home/.kimi-code/mcp.json`
  - `grok-toml` → `user_home/.grok/config.toml`
  - `codex-toml` → `user_home/.codex/config.toml`
  - else None
- `pub(crate) fn read_agents_file_text(path: &Path) -> String` — empty if missing
- Commands (in lib.rs after isolation checkout):
  - `read_agents_file(kind: String) -> String`
  - `write_agents_file(kind: String, text: String)` — create parent dirs; reject unknown kind

```rust
#[test]
fn maps_known_kinds_only() {
    let home = Path::new("/Users/me");
    let agents = Path::new("/Users/me/.agents");
    assert_eq!(
        agents_file_path(home, agents, "mcp-json"),
        Some(PathBuf::from("/Users/me/.agents/mcp.json"))
    );
    assert_eq!(
        agents_file_path(home, agents, "claude-json"),
        Some(PathBuf::from("/Users/me/.claude.json"))
    );
    assert_eq!(
        agents_file_path(home, agents, "codex-toml"),
        Some(PathBuf::from("/Users/me/.codex/config.toml"))
    );
    assert_eq!(agents_file_path(home, agents, "nope"), None);
}
```

Register both commands next to `import_agents_mcp_first_open`.

```
feat: read and write allowlisted AgentsStore and CLI MCP files
```

---

### Task 4: TS sync orchestration + workbench API

**Files:**
- Create: `src/lib/mcp-hub-sync.ts`
- Create: `src/lib/mcp-hub-sync.test.ts`
- Modify: `src/lib/workbench-api.ts` + test (clean)

**Interfaces (pure, no I/O):**
- `export function nextClaudeLiveText(existing: string, enabled: McpServer[], disabled: string[]): string` — `JSON.stringify(syncClaudeLive(JSON.parse or {}), ...)` pretty + newline
- `export function nextKimiLiveText(...)` — stringify `{ servers }` from `syncKimiLive`
- `export function grokMcpAddAfterCatalog(server: McpServer): string[]` — `grokMcpWriteArgv(server)`

Do **not** implement TOML in TS.

**workbench-api.ts:**
- `export async function readAgentsFile(kind: string): Promise<string>`
- `export async function writeAgentsFile(kind: string, text: string): Promise<void>`
- `export async function upsertAgentsMcpAndSync(server: McpServer): Promise<void>`
  - read mcp-json, parse, upsert, write
  - read claude-json / kimi-mcp, apply next*LiveText with enabled=`[server]`, disabled=`[]`, write
  - read grok-toml / codex-toml, they stay as-is in this TS function — **also** export `export async function upsertTomlMcp(kind: "grok-toml" | "codex-toml", name: string, command: string, args: string[]): Promise<void>` that invoke a rust command `upsert_toml_mcp` from Task 2

Wait — keep Task 4 TS-only for next*LiveText + read/write wrappers. Task 5 adds `upsert_toml_mcp` command and `syncHubMcp` that calls JSON + TOML + grok argv.

**Task 4 commit 1:** mcp-hub-sync.ts + tests  
**Task 4 commit 2:** workbench-api read/writeAgentsFile + tests

```
feat: format Claude and Kimi live MCP documents
feat: invoke allowlisted agents file read/write
```

---

### Task 5: upsert_toml_mcp command + syncHubMcp

**Files:**
- Isolation lib.rs: `upsert_toml_mcp(kind, name, command, args)` and `remove_toml_mcp(kind, name)` using `read_agents_file` paths + `mcp_toml::*`
- Modify: `src/lib/workbench-api.ts`

```
export async function syncHubMcpServer(server: McpServer): Promise<void> {
  const raw = await readAgentsFile("mcp-json");
  const catalog = upsertMcpCatalog(parseMcpJson(safeJson(raw)), server);
  await writeAgentsFile("mcp-json", stringifyMcpJson(catalog));
  const claude = await readAgentsFile("claude-json");
  await writeAgentsFile("claude-json", nextClaudeLiveText(claude, [server], []));
  const kimi = await readAgentsFile("kimi-mcp");
  await writeAgentsFile("kimi-mcp", nextKimiLiveText(kimi, [server], []));
  const cmd = server.commandOrUrl ?? "";
  await upsertTomlMcp("grok-toml", server.name, cmd, server.args ?? []);
  await upsertTomlMcp("codex-toml", server.name, cmd, server.args ?? []);
}

export async function removeHubMcpServer(name: string): Promise<void> {
  const catalog = removeMcpCatalog(parseMcpJson(safeJson(await readAgentsFile("mcp-json"))), name);
  await writeAgentsFile("mcp-json", stringifyMcpJson(catalog));
  // disable/remove from lives
  await writeAgentsFile("claude-json", nextClaudeLiveText(await readAgentsFile("claude-json"), [], [name]));
  await writeAgentsFile("kimi-mcp", nextKimiLiveText(await readAgentsFile("kimi-mcp"), [], [name]));
  await removeTomlMcp("grok-toml", name);
  await removeTomlMcp("codex-toml", name);
}
```

Test syncHubMcp with mocked invoke (record kinds written).

```
feat: sync hub MCP catalog into each CLI live file
```

---

### Task 6: Isolation — ExtensionsHub MCP add/remove

**Files:** dirty `src/components/ExtensionsHub.tsx`

Isolation dance. Replace `onAdd` grokMcpAdd-only with:
```
await syncHubMcpServer({ ...form, env, headers, args });
await grokMcpAdd(...) // keep argv after catalog (spec)
```

Replace `onRemove` with `removeHubMcpServer(name)` then existing grokMcpRemove.

Keep toggle/oauth/popular as grok for this task (toggle is grok-native enable).

Update the hint line from `将执行：grok ...` to mention `~/.agents/mcp.json` if that string is in the same hunk.

```
feat: hub MCP writes ~/.agents then syncs each CLI
```

---

### Task 7: Tagged permission replies

**Files:**
- Modify: `src/lib/workbench-api.ts` — `onTaggedAcpRequest`
- Modify: dirty `src/hooks/usePermissionQueue.ts` via isolation
- Optional new: `src/lib/permission-agent.ts` + test (prefer this so queue type stays)

```
export function onTaggedAcpRequest(handler: (agentId: AgentId, msg: unknown) => void): Promise<UnlistenFn>

export function permissionReplyAgent(agentId: AgentId | null | undefined, fallback: AgentId = "grok"): AgentId
```

Hook:
```
void onTaggedAcpRequest((agentId, msg) => {
  const parsed = permissionFromAcpRequest(msg as ...);
  if (!parsed) return;
  setPermissions((q) => enqueuePermission(q, { ...parsed, agentId }));
});
await sendRaw(..., permissionReplyAgent((request as { agentId?: AgentId }).agentId));
```

QueuedPermission extra field is fine if we spread it; TypeScript excess property is OK when stored as QueuedPermission (agentId dropped unless we extend the type).

**Extend QueuedPermission in a NEW helper test that does not edit dirty permission-queue.ts:** store as `QueuedPermission & { agentId: AgentId }` in the hook only.

```
feat: reply to permission prompts on the requesting agent
```

---
