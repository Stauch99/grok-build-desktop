# Multi-Agent Live Store, Import, and Doctor Wiring Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Close the spec’s remaining store/import holes: Claude MCP `headers`, first-open MCP/skill import without silent delete, Grok MCP write as today’s `grok mcp add` argv plus a TOML table merge, workbench home helpers in Rust, and local marketplace folder copy.

**Architecture:** Spec `docs/superpowers/specs/2026-08-30-multi-agent-acp-workbench-design.md`. TS merge helpers already live in `mcp-live.ts` / `skill-link.ts`. This wave adds missing merge/import rules and Rust path/copy units. Wiring `load_webui_state` onto `~/.acp-workbench/workbench.json` and hub marketplace buttons stay a follow-on isolation task (dirty `lib.rs` / `ExtensionsHub.tsx`).

**Tech Stack:** TypeScript + Vitest; Rust unit tests via `cargo test --manifest-path src-tauri/Cargo.toml`. No new dependencies.

## Global Constraints

- AgentId closed enum. Canonical store is `~/.agents`. Never read `~/.cc-switch`.
- First-open import: union missing names; same name + different command is a **conflict** — keep canonical, do not overwrite live or delete the extra folder.
- Never copy-mutate `SKILL.md`. Marketplace dest exists → blocked.
- Claude MCP mapping must preserve `headers`.
- Grok MCP write prefers `grok mcp add` argv (existing `mcpAddArgv`); TOML table merge is the file-level fallback (same shape as Codex `[mcp_servers.*]`).
- Dirty-file isolation. Never `git add -A`. Prefer new files or already-clean modules (`mcp-live.ts`, `agents_paths.rs`).
- TDD. Tests must not write the real user home.

## Follow-on (do not execute here)

- Isolation: `webui_path()` → workbench.json + migrate on load
- Hub MarketTab calls `install_skill_folder` instead of `grok plugin *`
- AdminPort trait + GrokAdapter extract + Kimi/Claude/Codex session scanners
- Composer `selectedAgentId` chip

---

### Task 1: Claude MCP headers + first-open MCP import

**Files:**
- Modify: `src/lib/mcp-live.ts`
- Modify: `src/lib/mcp-live.test.ts`

`mcp-live.ts` is clean on this branch. Do not touch dirty files.

**Interfaces:**
- Extend `ClaudeMcpEntry` with `headers?: Record<string, string>`
- `mcpServerToClaude` must map `server.headers` (`["K=V", ...]`) into `headers` for **both** stdio and http/sse. Reuse the same `key=value` split as `env` (`indexOf("=")`, skip `i<=0`).
- `parseClaudeMcpDoc` must read `headers` object back into `string[]` of `K=V` (stable key sort).
- `export function firstOpenMcpImport(canonical: McpServer[], live: McpServer[]): { catalog: McpServer[]; conflicts: string[] }`
  - Walk `live` in order.
  - If name missing from canonical → append.
  - If name exists and `commandOrUrl`/`transport` are equal (treat missing commandOrUrl as `""`) → skip.
  - If name exists and command or transport differ → add name to `conflicts`, keep the canonical row.
  - Do not mutate the input arrays.

- [ ] **Step 1: failing tests** — append to `mcp-live.test.ts`:

```ts
import { firstOpenMcpImport } from "./mcp-live";

describe("mcpServerToClaude headers", () => {
  it("keeps headers on stdio and http", () => {
    const keyed: McpServer = {
      name: "git",
      transport: "stdio",
      commandOrUrl: "uvx",
      headers: ["X-A=1", "X-B=2"],
    };
    expect(mcpServerToClaude(keyed).headers).toEqual({ "X-A": "1", "X-B": "2" });
    expect(
      mcpServerToClaude({ name: "docs", transport: "http", commandOrUrl: "https://x", headers: ["Auth=tok"] }).headers,
    ).toEqual({ Auth: "tok" });
  });
});

describe("parseClaudeMcpDoc headers", () => {
  it("round-trips headers object to K=V", () => {
    const rows = parseClaudeMcpDoc({
      mcpServers: { git: { command: "uvx", headers: { "X-B": "2", "X-A": "1" } } },
    });
    expect(rows[0]?.headers).toEqual(["X-A=1", "X-B=2"]);
  });
});

describe("firstOpenMcpImport", () => {
  it("unions missing names and reports conflicts without overwriting", () => {
    const canonical: McpServer[] = [{ name: "git", transport: "stdio", commandOrUrl: "uvx" }];
    const live: McpServer[] = [
      { name: "git", transport: "stdio", commandOrUrl: "npx" },
      { name: "docs", transport: "http", commandOrUrl: "https://x" },
    ];
    const next = firstOpenMcpImport(canonical, live);
    expect(next.catalog).toEqual([
      { name: "git", transport: "stdio", commandOrUrl: "uvx" },
      { name: "docs", transport: "http", commandOrUrl: "https://x" },
    ]);
    expect(next.conflicts).toEqual(["git"]);
  });
});
```

- [ ] **Step 2:** `npm test -- src/lib/mcp-live.test.ts` — new cases FAIL
- [ ] **Step 3:** implement in `mcp-live.ts`
- [ ] **Step 4:** tests PASS (including existing cases)
- [ ] **Step 5:** Commit only `src/lib/mcp-live.ts` and `src/lib/mcp-live.test.ts`

```
feat: preserve Claude MCP headers and import without overwrite
```

---

### Task 2: First-open skill offer (no silent delete)

**Files:**
- Create: `src/lib/first-open-import.ts`
- Create: `src/lib/first-open-import.test.ts`

**Interfaces:**
- `export type SkillImportAction = "linked" | "offer-import" | "absent"`
- `export function firstOpenSkillAction(input: { destExists: boolean; destIsSymlink: boolean; destReadlink?: string; canonicalDir: string }): SkillImportAction`
  - `!destExists` → `"absent"`
  - `destIsSymlink && destReadlink === canonicalDir` → `"linked"`
  - else → `"offer-import"` (real folder or other symlink). **Never** imply delete.

- [ ] **Step 1:**

```ts
import { describe, expect, it } from "vitest";
import { firstOpenSkillAction } from "./first-open-import";

describe("firstOpenSkillAction", () => {
  it("offers import instead of deleting a real folder", () => {
    expect(firstOpenSkillAction({ destExists: false, destIsSymlink: false, canonicalDir: "/a/pdf" })).toBe("absent");
    expect(
      firstOpenSkillAction({
        destExists: true,
        destIsSymlink: true,
        destReadlink: "/a/pdf",
        canonicalDir: "/a/pdf",
      }),
    ).toBe("linked");
    expect(
      firstOpenSkillAction({ destExists: true, destIsSymlink: false, canonicalDir: "/a/pdf" }),
    ).toBe("offer-import");
    expect(
      firstOpenSkillAction({
        destExists: true,
        destIsSymlink: true,
        destReadlink: "/other",
        canonicalDir: "/a/pdf",
      }),
    ).toBe("offer-import");
  });
});
```

- [ ] **Step 2–4:** implement, pass, commit only the two new files.

```
feat: offer first-open skill import instead of silent delete
```

---

### Task 3: Grok MCP argv + TOML table alias

**Files:**
- Create: `src/lib/mcp-grok.ts`
- Create: `src/lib/mcp-grok.test.ts`

**Interfaces:**
- Consumes `mcpAddArgv` from `./grok-cli` and `mergeCodexMcpTables` / `removeCodexMcpServer` / `mcpServerToCodex` from `./mcp-live`
- `export function grokMcpWriteArgv(server: McpServer, scope?: "user" | "project"): string[]` — `mcpAddArgv({ ...server, scope })`
- `export const mergeGrokMcpTables = mergeCodexMcpTables`
- `export const removeGrokMcpServer = removeCodexMcpServer`
- `export const mcpServerToGrokToml = mcpServerToCodex`

- [ ] **Step 1:**

```ts
import { describe, expect, it } from "vitest";
import { grokMcpWriteArgv, mergeGrokMcpTables, mcpServerToGrokToml } from "./mcp-grok";

describe("grok MCP write", () => {
  it("prefers grok mcp add argv and can merge a toml table", () => {
    expect(
      grokMcpWriteArgv({ name: "git", transport: "stdio", commandOrUrl: "uvx", args: ["mcp-git"] }),
    ).toEqual(["mcp", "add", "git", "--", "uvx", "mcp-git"]);
    expect(mcpServerToGrokToml({ name: "docs", transport: "http", commandOrUrl: "https://x" })).toEqual({
      url: "https://x",
    });
    const next = mergeGrokMcpTables({ old: { command: "a" } }, [
      { name: "git", transport: "stdio", commandOrUrl: "uvx" },
    ]);
    expect(next.old).toEqual({ command: "a" });
    expect(next.git).toEqual({ command: "uvx" });
  });
});
```

- [ ] **Step 2–4:** implement, pass, commit two new files.

```
feat: write Grok MCP via mcp add argv with TOML table fallback
```

---

### Task 4: Rust workbench paths on agents_paths

**Files:**
- Modify: `src-tauri/src/agents_paths.rs` (already registered, clean)

Do **not** change `lib.rs`. Add functions + tests to `agents_paths.rs` only.

**Interfaces:**
- `pub(crate) fn workbench_home_from(home: &Path, override_env: Option<&str>) -> PathBuf` — env non-empty wins, else `home.join(".acp-workbench")`
- `pub(crate) fn workbench_json_path(wb: &Path) -> PathBuf` — `wb.join("workbench.json")`
- `pub(crate) fn grok_webui_path(grok_home: &Path) -> PathBuf` — `grok_home.join("webui.json")`
- `pub(crate) fn should_migrate_webui(workbench_exists: bool, grok_webui_exists: bool) -> bool` — `!workbench_exists && grok_webui_exists`

- [ ] **Step 1:** add tests in the existing `#[cfg(test)]` module:

```rust
#[test]
fn workbench_paths_and_migrate_gate() {
    let home = Path::new("/Users/me");
    assert_eq!(
        workbench_home_from(home, None),
        PathBuf::from("/Users/me/.acp-workbench")
    );
    assert_eq!(
        workbench_home_from(home, Some("/tmp/wb")),
        PathBuf::from("/tmp/wb")
    );
    assert_eq!(
        workbench_json_path(&PathBuf::from("/Users/me/.acp-workbench")),
        PathBuf::from("/Users/me/.acp-workbench/workbench.json")
    );
    assert_eq!(
        grok_webui_path(Path::new("/Users/me/.grok")),
        PathBuf::from("/Users/me/.grok/webui.json")
    );
    assert!(should_migrate_webui(false, true));
    assert!(!should_migrate_webui(true, true));
    assert!(!should_migrate_webui(false, false));
}
```

- [ ] **Step 2:** `cargo test --manifest-path src-tauri/Cargo.toml agents_paths -- --nocapture` FAIL on missing items
- [ ] **Step 3:** implement
- [ ] **Step 4:** PASS
- [ ] **Step 5:** Commit only `src-tauri/src/agents_paths.rs`

```
feat: resolve ~/.acp-workbench paths next to agents home
```

---

### Task 5: Marketplace copy skill folder (Rust, new file + isolation register)

**Files:**
- Create: `src-tauri/src/marketplace.rs`
- Modify: `src-tauri/src/lib.rs` — **only** add `mod marketplace;` next to `mod agents_paths;` using the isolation dance below.

**Interfaces:**
- `pub(crate) fn skill_folder_name(source: &Path) -> Option<String>` — file_name UTF-8 matching `^[a-z][a-z0-9-]*$`
- `pub(crate) fn install_skill_folder(source: &Path, dest: &Path) -> Result<(), String>`
  - dest exists → `Err("exists")`
  - source not a dir or missing `SKILL.md` file → `Err("invalid")`
  - else recursively copy source → dest (files and dirs only; skip symlinks)

Tests use `tempfile::TempDir` if the crate already depends on `tempfile`; otherwise `std::env::temp_dir()` + unique name. Check `src-tauri/Cargo.toml` first. Prefer std temp if tempfile is absent.

- [ ] **Step 1:** write `marketplace.rs` tests first (they will not compile until `mod marketplace` exists — that is expected RED)

```rust
#[cfg(test)]
mod tests {
    use super::*;
    use std::fs;
    use std::path::PathBuf;

    fn uniq_dir() -> PathBuf {
        let p = std::env::temp_dir().join(format!(
            "acp-mkt-{}-{}",
            std::process::id(),
            std::time::SystemTime::now()
                .duration_since(std::time::UNIX_EPOCH)
                .unwrap()
                .as_nanos()
        ));
        fs::create_dir_all(&p).unwrap();
        p
    }

    #[test]
    fn name_and_copy_and_block() {
        assert_eq!(skill_folder_name(Path::new("/tmp/pdf-review")), Some("pdf-review".into()));
        assert_eq!(skill_folder_name(Path::new("/tmp/Pdf")), None);
        let root = uniq_dir();
        let src = root.join("pdf-review");
        fs::create_dir_all(&src).unwrap();
        fs::write(src.join("SKILL.md"), "# pdf\n").unwrap();
        let dest = root.join("out");
        install_skill_folder(&src, &dest).unwrap();
        assert_eq!(fs::read_to_string(dest.join("SKILL.md")).unwrap(), "# pdf\n");
        assert_eq!(install_skill_folder(&src, &dest).unwrap_err(), "exists");
        fs::remove_dir_all(root).ok();
    }
}
```

- [ ] **Step 2: Isolation for `lib.rs`**
  1. Copy current dirty `src-tauri/src/lib.rs` to `/tmp/lib.rs.dirty`
  2. `git checkout HEAD -- src-tauri/src/lib.rs`
  3. Add `mod marketplace;` immediately after `mod agents_paths;`
  4. `cargo test --manifest-path src-tauri/Cargo.toml marketplace -- --nocapture` GREEN
  5. `git add src-tauri/src/marketplace.rs src-tauri/src/lib.rs` and commit
  6. Copy `/tmp/lib.rs.dirty` back over `src-tauri/src/lib.rs`
  7. Re-apply `mod marketplace;` to the restored dirty file if it is missing

Commit message:

```
feat: copy marketplace skill folders into ~/.agents
```

If isolation would require touching other dirty hunks, STOP and report BLOCKED.

---
