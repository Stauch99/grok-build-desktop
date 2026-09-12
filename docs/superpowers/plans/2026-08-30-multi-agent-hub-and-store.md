# Multi-Agent Hub and AgentsStore Sync Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Drop the plugins hub tab, add Codex MCP table merge plus Claude MCP import, and make `create_skill` write canonical `~/.agents/skills/<name>/SKILL.md`.

**Architecture:** Spec `docs/superpowers/specs/2026-08-30-multi-agent-acp-workbench-design.md`. Wave 2 already has persist helpers, skill-link, Claude/Kimi JSON merge. This wave connects them to hub chrome and skill create. Grok MCP stays `grok mcp add` argv (existing `mcpAddArgv`); do not invent Grok TOML surgery. First-open import of native skill folders and marketplace zip/GitHub install are follow-on.

**Tech Stack:** TypeScript + Vitest, existing Rust `create_skill`. No new dependencies.

## Global Constraints

- Spec path: `docs/superpowers/specs/2026-08-30-multi-agent-acp-workbench-design.md`.
- Hub tabs: `skills | mcp | marketplace | hooks`. No `plugins` tab. `/plugins` already aliases to skills.
- Canonical skill editor target is `~/.agents/skills/<name>/SKILL.md` (user scope). Project scope: `<cwd>/.agents/skills/<name>/SKILL.md`.
- Do not implement plugin install/enable. Do not invent Grok/Claude plugin marketplaces.
- Do not spawn CLIs. Do not read `~/.cc-switch`.
- Leave dirty files unless the Files list includes them. `git add` only owned files. Never `git add -A`.
- Isolation for dirty files (`commands.ts`, `ExtensionsHub.tsx`, `palette.ts`, `useAppModel.ts`, `cli_bridge.rs`): copy aside → HEAD → patch → commit → restore → re-apply hunks.
- Tests: `npm test -- src/lib/<file>.test.ts`. TDD.

## Follow-on (do not execute in this file)

- Marketplace: install skill folder from GitHub/zip/local into `~/.agents/skills`
- First-open import of native non-symlink skills
- Rust FS writers for live MCP files
- Kimi/Claude/Codex session adapters
- Usage brand switcher

---

### Task 1: Codex MCP table merge and Claude import

**Files:**
- Modify: `src/lib/mcp-live.ts`
- Modify: `src/lib/mcp-live.test.ts`

**Interfaces:**
- Consumes: `McpServer`, `parseMcpJson`, existing Claude helpers
- Produces:
  - `export type CodexMcpEntry = { command?: string; args?: string[]; env?: Record<string, string>; url?: string }`
  - `export function mcpServerToCodex(server: McpServer): CodexMcpEntry` — stdio → command/args/env (same env parse as Claude); http/sse → `{ url }`
  - `export function mergeCodexMcpTables(existing: Record<string, CodexMcpEntry>, servers: McpServer[]): Record<string, CodexMcpEntry>` — upsert by name, keep other keys
  - `export function removeCodexMcpServer(existing: Record<string, CodexMcpEntry>, name: string): Record<string, CodexMcpEntry>`
  - `export function parseClaudeMcpDoc(doc: unknown): McpServer[]` — read `mcpServers` map: `{ command }` → stdio; `{ type: "http"|"sse", url }` → that transport; skip nameless/invalid

Reuse the same `envRecord` already in the file (do not duplicate if it is not exported — call through `mcpServerToClaude` env or extract a shared helper in this file only).

- [ ] **Step 1: Write the failing tests** (append to `mcp-live.test.ts`)

```ts
import {
  mergeCodexMcpTables,
  mcpServerToCodex,
  parseClaudeMcpDoc,
  removeCodexMcpServer,
} from "./mcp-live";

describe("codex mcp tables", () => {
  const git: McpServer = {
    name: "git",
    transport: "stdio",
    commandOrUrl: "uvx",
    args: ["mcp-git"],
    env: ["TOKEN=abc"],
  };
  it("maps and upserts without deleting neighbors", () => {
    expect(mcpServerToCodex(git)).toEqual({
      command: "uvx",
      args: ["mcp-git"],
      env: { TOKEN: "abc" },
    });
    expect(mcpServerToCodex({ name: "docs", transport: "http", commandOrUrl: "https://x" })).toEqual({
      url: "https://x",
    });
    const next = mergeCodexMcpTables({ old: { command: "a" } }, [git]);
    expect(next.old).toEqual({ command: "a" });
    expect(next.git).toEqual({ command: "uvx", args: ["mcp-git"], env: { TOKEN: "abc" } });
    expect(removeCodexMcpServer(next, "git").git).toBeUndefined();
    expect(removeCodexMcpServer(next, "git").old).toEqual({ command: "a" });
  });
});

describe("parseClaudeMcpDoc", () => {
  it("imports mcpServers map into McpServer rows", () => {
    expect(
      parseClaudeMcpDoc({
        mcpServers: {
          git: { command: "uvx", args: ["mcp-git"] },
          docs: { type: "http", url: "https://x" },
        },
      }),
    ).toEqual([
      { name: "git", transport: "stdio", commandOrUrl: "uvx", args: ["mcp-git"] },
      { name: "docs", transport: "http", commandOrUrl: "https://x" },
    ]);
    expect(parseClaudeMcpDoc(null)).toEqual([]);
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npm test -- src/lib/mcp-live.test.ts`
Expected: FAIL (exports missing)

- [ ] **Step 3: Write minimal implementation** (append to `mcp-live.ts`)

```ts
export type CodexMcpEntry = {
  command?: string;
  args?: string[];
  env?: Record<string, string>;
  url?: string;
};

export function mcpServerToCodex(server: McpServer): CodexMcpEntry {
  if (server.transport === "http" || server.transport === "sse") {
    const entry: CodexMcpEntry = {};
    if (server.commandOrUrl) entry.url = server.commandOrUrl;
    return entry;
  }
  const entry: CodexMcpEntry = {};
  if (server.commandOrUrl) entry.command = server.commandOrUrl;
  if (server.args?.length) entry.args = server.args;
  const env = envRecord(server.env);
  if (env) entry.env = env;
  return entry;
}

export function mergeCodexMcpTables(
  existing: Record<string, CodexMcpEntry>,
  servers: McpServer[],
): Record<string, CodexMcpEntry> {
  const next = { ...existing };
  for (const server of servers) next[server.name] = mcpServerToCodex(server);
  return next;
}

export function removeCodexMcpServer(
  existing: Record<string, CodexMcpEntry>,
  name: string,
): Record<string, CodexMcpEntry> {
  const next = { ...existing };
  delete next[name];
  return next;
}

export function parseClaudeMcpDoc(doc: unknown): McpServer[] {
  if (!doc || typeof doc !== "object" || Array.isArray(doc)) return [];
  const raw = (doc as Record<string, unknown>).mcpServers;
  if (!raw || typeof raw !== "object" || Array.isArray(raw)) return [];
  const out: McpServer[] = [];
  for (const [name, val] of Object.entries(raw as Record<string, unknown>)) {
    if (!name || !val || typeof val !== "object" || Array.isArray(val)) continue;
    const rec = val as Record<string, unknown>;
    if (rec.type === "http" || rec.type === "sse") {
      const row: McpServer = { name, transport: rec.type };
      if (typeof rec.url === "string") row.commandOrUrl = rec.url;
      out.push(row);
      continue;
    }
    if (typeof rec.command !== "string") continue;
    const row: McpServer = { name, transport: "stdio", commandOrUrl: rec.command };
    const args = rec.args;
    if (Array.isArray(args) && args.every((x) => typeof x === "string")) row.args = args as string[];
    out.push(row);
  }
  return out;
}
```

`envRecord` already exists in this file from Wave 2 — reuse it. Do not export it unless needed.

- [ ] **Step 4: Run tests**

Run: `npm test -- src/lib/mcp-live.test.ts`
Expected: PASS (old + new)

- [ ] **Step 5: Commit**

```bash
git add src/lib/mcp-live.ts src/lib/mcp-live.test.ts
git commit -m "$(cat <<'EOF'
feat: merge Codex MCP tables and import Claude mcpServers

EOF
)"
```

---

### Task 2: Drop plugins from HubTab

**Files:**
- Modify: `src/lib/commands.ts` (`HubTab` union)
- Modify: `src/lib/commands.test.ts` if needed
- Modify: `src/components/ExtensionsHub.tsx` (`TABS`, plugins pane)
- Modify: `src/lib/palette.ts` (`act:hub-plugins` → open skills; change label to 技能)
- Modify: `src/hooks/useAppModel.ts` (`case "hub-plugins": openHub("skills")`)

**Interfaces:**
- Produces: `export type HubTab = "skills" | "mcp" | "marketplace" | "hooks"`
- `TABS` in ExtensionsHub equals that list in that order
- Remove the plugins tab body (`tab === "plugins"` blocks)
- Palette item `act:hub-plugins` stays as an id (so old keybinds still fire) but `label` becomes `扩展中心 · 技能` and `hint` stays `/plugins`
- `useAppModel` `hub-plugins` calls `openHub("skills")`

Isolation on every dirty file in the Files list.

- [ ] **Step 1: Write/adjust tests**

In `commands.test.ts` append:

```ts
describe("HubTab", () => {
  it("does not include plugins", () => {
    const tabs: HubTab[] = ["skills", "mcp", "marketplace", "hooks"];
    expect(tabs).not.toContain("plugins" as HubTab);
  });
});
```

If `HubTab` still includes `"plugins"`, this test still passes (because of the `as` cast). **Do not rely on that.** After changing the union, `as HubTab` on `"plugins"` is a type lie. Instead test TABS via exporting nothing — add this assertion in a new `src/lib/hub-tabs.test.ts`:

```ts
import { describe, expect, it } from "vitest";
import type { HubTab } from "./commands";

export const HUB_TABS: HubTab[] = ["skills", "mcp", "marketplace", "hooks"];

describe("HUB_TABS", () => {
  it("is skills mcp marketplace hooks", () => {
    expect(HUB_TABS).toEqual(["skills", "mcp", "marketplace", "hooks"]);
  });
});
```

Put `HUB_TABS` in `src/lib/commands.ts` next to the type and import it from ExtensionsHub for `TABS`. That way the test locks the list.

- [ ] **Step 2: Run test to verify it fails**

Run: `npm test -- src/lib/commands.test.ts` or the new file
Expected: FAIL until `HUB_TABS` exists

- [ ] **Step 3: Implement**

In `commands.ts`:

```ts
export type HubTab = "skills" | "mcp" | "marketplace" | "hooks";
export const HUB_TABS: HubTab[] = ["skills", "mcp", "marketplace", "hooks"];
```

ExtensionsHub: `const TABS = HUB_TABS;` and delete plugins-only UI (the `tab === "plugins"` section and `PluginsPane` usage). If deleting the pane leaves unused helpers, remove those unused imports/functions **only if they become unused in this file**. Do not delete inspect plugin parsers in `inspect.ts`.

palette.ts: change the hub-plugins action label to `扩展中心 · 技能`.

useAppModel.ts: `case "hub-plugins": openHub("skills"); break;`

- [ ] **Step 4: Run**

`npm test -- src/lib/commands.test.ts src/lib/hub-tabs.test.ts src/lib/palette.test.ts`
Expected: PASS. `npx tsc --noEmit` if the project uses it; fix HubTab type errors in owned files.

- [ ] **Step 5: Commit** owned files only (isolation).

```bash
git commit -m "$(cat <<'EOF'
feat: drop the plugins hub tab in favor of skills

EOF
)"
```

---

### Task 3: create_skill writes ~/.agents/skills

**Files:**
- Modify: `src-tauri/src/cli_bridge.rs` (`create_skill` destination paths)

**Interfaces:**
- User scope: `{agents_home}/skills/{name}/SKILL.md` where `agents_home` is `$HOME/.agents` (or `ACP_AGENTS_HOME` if set, for tests)
- Project scope: `{cwd}/.agents/skills/{name}/SKILL.md` via existing `project_scoped_path` but with `.agents/skills` instead of `.grok/skills`
- Keep `skill_name_ok`, templates, and return `{ path }`
- Do not write `~/.grok/skills`

Add a tiny helper in `cli_bridge.rs` (or `agent_host.rs` if you must keep cli_bridge smaller):

```rust
pub(crate) fn agents_home() -> PathBuf {
    std::env::var("ACP_AGENTS_HOME")
        .map(PathBuf::from)
        .unwrap_or_else(|_| dirs_home().join(".agents"))
}
```

Use the same `dirs_home` as grok. If `dirs_home` is in `lib.rs` and not public to cli_bridge, duplicate the env override `ACP_AGENTS_HOME` only and join `dirs::home_dir()`.

**Test:** add `#[cfg(test)]` in cli_bridge or a new `agents_paths.rs` module with:

```rust
#[test]
fn agents_home_uses_override() {
    // Do not mutate process env in a racy way if other tests share the process.
    // Prefer a pure function:
}
```

Prefer:

```rust
pub(crate) fn agents_home_from(home: &Path, override_env: Option<&str>) -> PathBuf {
    match override_env {
        Some(p) if !p.is_empty() => PathBuf::from(p),
        _ => home.join(".agents"),
    }
}
```

Then `create_skill` uses `agents_home_from(&dirs_home(), std::env::var("ACP_AGENTS_HOME").ok().as_deref())`.

User path: `agents_home.join("skills").join(&name).join("SKILL.md")`.
Project path: `.agents/skills/{name}/SKILL.md`.

Isolation on `cli_bridge.rs`.

- [ ] **Step 1: Failing test** in `src-tauri/src/agents_paths.rs` (new file) + `mod agents_paths;` in `lib.rs` (isolation one line).

```rust
#[test]
fn user_skill_path() {
    let home = agents_home_from(Path::new("/Users/me"), None);
    assert_eq!(home, PathBuf::from("/Users/me/.agents"));
    assert_eq!(
        skill_md_path(&home, "pdf"),
        PathBuf::from("/Users/me/.agents/skills/pdf/SKILL.md")
    );
}

#[test]
fn override_env_wins() {
    let home = agents_home_from(Path::new("/Users/me"), Some("/tmp/agents"));
    assert_eq!(home, PathBuf::from("/tmp/agents"));
}
```

```rust
pub(crate) fn skill_md_path(agents_home: &Path, name: &str) -> PathBuf {
    agents_home.join("skills").join(name).join("SKILL.md")
}
```

- [ ] **Step 2: cargo test agents_paths** — FAIL then implement.

- [ ] **Step 3: Point `create_skill` at these helpers.** Project branch: `Path::new(".agents/skills").join(&name).join("SKILL.md")`.

- [ ] **Step 4: cargo test agents_paths** PASS.

- [ ] **Step 5: Commit** `agents_paths.rs`, isolated `lib.rs` one-line `mod`, isolated `cli_bridge.rs` create_skill paths.

```bash
git commit -m "$(cat <<'EOF'
feat: create skills under ~/.agents instead of ~/.grok

EOF
)"
```

---
