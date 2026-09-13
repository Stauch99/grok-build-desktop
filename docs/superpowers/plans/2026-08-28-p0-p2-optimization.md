# P0–P2 Optimization Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Land every P0, P1, and P2 item in `docs/grok-build-desktop-optimization.md` on Grok Build Desktop 0.4.0 without expanding P3.

**Architecture:** Harden the Tauri security boundary first (CSP, asset scope, TOCTOU-safe writes, argument injection). Then type the ACP event stream and split the oversized UI files so performance work has a place to live. Then cut long-session cost (incremental hydrate, memo, virtual list, fs events, lazy mermaid). Then ship the product gaps (preview, git commit, session UX, i18n, a11y) on that foundation.

**Tech Stack:** React 19 + TypeScript + Vite + Vitest, Tauri 2 (Rust), existing `marked` / `mermaid`. Add `react-window` only in Task 12 and `notify` only in Task 14. No other new heavy libraries.

## Global Constraints

- Do not implement any P3 item (ids 4, 5, 8, 9, 16, 26, 29, 33–37, 40, 48, 53, 54, 59, 67, 69, 70, 78, 86, 87).
- `HtmlArtifactPreview` iframe `sandbox` must stay empty (`sandbox=""`). Never add `allow-same-origin` or `allow-scripts`.
- Asset protocol must not allow `$HOME/**`. Workspace access is runtime-only via `app.asset_protocol_scope().allow_directory` in `set_workspace` (already present — keep it).
- File writes that currently `canonicalize` then `std::fs::write` must become `O_NOFOLLOW` open-on-fd then write. Do not reintroduce canonicalize-then-write.
- `write_config_text` / `patch_cli_settings` share one process-wide async mutex. Config text cap is **512 * 1024** bytes (not 2MB).
- CSP must not include `unsafe-eval`. If mermaid needs eval, isolate it; do not loosen the app CSP.
- Follow existing patterns: Vitest in `src/lib/*.test.ts`, Rust tests in `src-tauri/src/lib.rs` `#[cfg(test)]` (or a new `src-tauri/src/*.rs` module with `#[cfg(test)]`). Chinese UI copy; i18n keys go in both `ZH` and `EN`.
- `git add` only files this task owns. Never `git add -A`. Never commit `.env`, credentials, or `src-tauri/target`.
- Do not restructure files a later task owns. Task 8 owns the App.tsx hook split; Task 9 owns Composer split; Task 10 owns CSS split.
- Existing dirty working-tree files from before this branch are in-progress product code. Leave them unless this task's Files list includes them.
- Tests: `npm test` for TS; `cargo test --manifest-path src-tauri/Cargo.toml` for Rust. TDD: failing test first, then implementation.
- Title overrides already persist via `saveWebuiState` / `webui.json`. Task 19 must not invent a second store; it verifies and covers the no-session draft gap (#10) and first-message fallback (#91).
- `set_workspace` already calls `asset_protocol_scope().allow_directory`. Do not remove that call.
- Keep the current visual language (tokens in `src/styles.css`). New UI uses existing classes (`btn`, `palette`, `hint`) unless a task adds a named class.

## Item → Task map

P0: 97,96 → T1; 98 → T2; 66 → T3; 89 → T4.
P1: 99,80 → T5; 100 → T6; 64,84 → T7; 61,49 → T8; 63 → T9; 62 → T10; 43,68 → T11; 44,50,77 → T12; 42,75,47 → T13; 45,46,71,74,88,95 → T14; 76 → T15; 12,19 → T16; 20 → T17; 24 → T18; 1,81 → T19; 21 → T20; 55,93 → T21.
P2: 82,83 → T4; 85,90 → T6; 13,14,15,17,18 → T16; 27 → T17; 23,25,28 → T18; 2,3,6,7,10,11,91 → T19; 22 → T20; 38,39,41 → T21; 30,31,32 → T22; 56,57,58,60 → T23; 51,52,65,72,73,79,92,94 → T24.

---

### Task 1: CSP and asset-protocol scope

**Files:**
- Modify: `src-tauri/tauri.conf.json`
- Create: `src/lib/asset-src.ts`
- Create: `src/lib/asset-src.test.ts`
- Create: `src/lib/csp.test.ts`
- Modify: `src/components/PreviewPane.tsx`, `src/components/Markdown.tsx`, `src/components/ImagineGallery.tsx`, `src/components/AttachStrip.tsx`, `src/components/UserTurn.tsx`
- Modify: `src/lib/markdown.ts` / `src/lib/media.ts` only if they take a `toSrc` callback — pass `safeFileSrc` from callers.

**Interfaces:**
- Consumes: existing `convertFileSrc` from `@tauri-apps/api/core`; `set_workspace` already expands scope.
- Produces: `export function assetRoots(cwd: string, grokHome: string): string[]`; `export function isAssetAllowed(path: string, roots: string[]): boolean`; `export function safeFileSrc(path: string, roots: string[], convert: (p: string) => string): string | null`

**CSP value (verbatim in `tauri.conf.json` `app.security.csp`):**

```
default-src 'self'; script-src 'self'; style-src 'self' 'unsafe-inline'; img-src 'self' asset: http://asset.localhost https://asset.localhost blob: data:; media-src 'self' asset: http://asset.localhost https://asset.localhost blob:; font-src 'self' data:; connect-src ipc: http://ipc.localhost https://ipc.localhost http://localhost:1420 ws://localhost:1420 https:; frame-src 'self'; object-src 'none'; base-uri 'self'; form-action 'none'
```

**Asset protocol `allow` (verbatim — no `$HOME/**`):**

```
"$TEMP/**", "/tmp/**", "/private/tmp/**", "/var/folders/**", "/private/var/folders/**", "$HOME/.grok/sessions/**"
```

**Asset protocol `deny` (keep existing and add):**

```
"$HOME/.ssh/**", "$HOME/.gnupg/**", "$HOME/.aws/**", "$HOME/.grok/auth.json", "$HOME/.config/**", "$HOME/.kube/**", "$HOME/Library/Keychains/**"
```

- [ ] **Step 1: Write failing tests**

`src/lib/csp.test.ts` reads `src-tauri/tauri.conf.json` and asserts `security.csp` is a string, does not contain `unsafe-eval`, does not equal `null`, includes `script-src 'self'`, and `assetProtocol.scope.allow` does not include `$HOME/**`.

`src/lib/asset-src.test.ts`:

```ts
import { describe, expect, it } from "vitest";
import { assetRoots, isAssetAllowed, safeFileSrc } from "./asset-src";

describe("asset-src", () => {
  const roots = assetRoots("/Users/me/proj", "/Users/me/.grok");
  it("allows workspace and grok sessions", () => {
    expect(isAssetAllowed("/Users/me/proj/shot.png", roots)).toBe(true);
    expect(isAssetAllowed("/Users/me/.grok/sessions/a/cover.png", roots)).toBe(true);
  });
  it("rejects home and ssh", () => {
    expect(isAssetAllowed("/Users/me/secret.png", roots)).toBe(false);
    expect(isAssetAllowed("/Users/me/.ssh/id_rsa", roots)).toBe(false);
  });
  it("safeFileSrc returns null outside roots", () => {
    expect(safeFileSrc("/etc/passwd", roots, (p) => `asset://${p}`)).toBeNull();
    expect(safeFileSrc("/Users/me/proj/a.png", roots, (p) => `asset://${p}`)).toBe("asset:///Users/me/proj/a.png");
  });
});
```

- [ ] **Step 2: Run tests — expect FAIL** (`npm test -- src/lib/csp.test.ts src/lib/asset-src.test.ts`)
- [ ] **Step 3: Implement** `asset-src.ts` with prefix checks that normalize trailing slashes and reject `..` after resolve via string prefix `root + "/"`. Wire `safeFileSrc` at every `convertFileSrc` call site (pass workspace cwd + `~/.grok` as roots; if cwd unknown, only grok sessions). Set CSP and scope in `tauri.conf.json`.
- [ ] **Step 4: Run tests — expect PASS.** Also `npm test`.
- [ ] **Step 5: Commit** `fix: constrain CSP and asset protocol to workspace roots`

---

### Task 2: HtmlArtifactPreview sandbox lock

**Files:**
- Modify: `src/components/HtmlArtifactPreview.tsx`
- Create: `src/components/HtmlArtifactPreview.test.ts` (pure helpers) and/or extract `buildSrcDoc(html: string): string` + `HTML_FRAME_SANDBOX = "" as const`

**Interfaces:**
- Produces: `export const HTML_FRAME_SANDBOX = "";` `export function buildSrcDoc(html: string): string`

Note: the iframe already uses `sandbox=""`. This task adds a regression test and a CSP-friendly `referrerPolicy` (already present). Do not add sandbox tokens.

- [ ] **Step 1: Failing test** that `HTML_FRAME_SANDBOX === ""` and that `buildSrcDoc` wraps fragments, preserves full documents, and injects `<meta name="referrer" content="no-referrer">` on wrapped docs.
- [ ] **Step 2: Run — FAIL**
- [ ] **Step 3: Export the constant from the component file (or a tiny `src/lib/html-frame.ts`) and use it as `sandbox={HTML_FRAME_SANDBOX}`. Keep `srcDoc`. No `allow-same-origin`.**
- [ ] **Step 4: PASS + `npm test`**
- [ ] **Step 5: Commit** `fix: lock HTML artifact iframe to empty sandbox`

---

### Task 3: write_allowed_text TOCTOU

**Files:**
- Modify: `src-tauri/src/cli_bridge.rs` (`write_allowed_text`, add `write_nofollow`)
- Modify: `src-tauri/src/lib.rs` tests (or `cli_bridge` `#[cfg(test)]`)

**Interfaces:**
- Produces: `pub(crate) fn write_nofollow(path: &Path, bytes: &[u8]) -> std::io::Result<()>`
  Unix: `OpenOptions` with `write(true).create(true).truncate(true)` plus `custom_flags(libc::O_NOFOLLOW)` then write the fd. If parent must be created, create_dir_all on parent **before** open, then re-run `scoped_write_target` and open the final path with `O_NOFOLLOW`.
  Non-unix: open without following symlinks if the platform allows; otherwise error if `path.symlink_metadata()?.file_type().is_symlink()`.
- Add `libc` only if needed; prefer `std::os::unix::fs::OpenOptionsExt::custom_flags`.

- [ ] **Step 1: Write a Rust test** that creates a temp dir, a real file inside an allowed root, and a symlink to `/tmp/pwned-outside`. Calling `write_nofollow` on the symlink must fail; the outside file must stay unchanged. Calling it on a regular file must write contents.
- [ ] **Step 2: `cargo test --manifest-path src-tauri/Cargo.toml write_nofollow -- --nocapture` expect FAIL**
- [ ] **Step 3: Implement `write_nofollow` and replace `std::fs::write(&checked, text)` in `write_allowed_text`. Do not canonicalize then write. Keep `scoped_write_target` for policy.**
- [ ] **Step 4: PASS `cargo test --manifest-path src-tauri/Cargo.toml`**
- [ ] **Step 5: Commit** `fix: write allowed text without following symlinks`

---

### Task 4: config.toml write lock, size cap, patch whitelist

**Files:**
- Modify: `src-tauri/src/cli_bridge.rs` (`write_config_text`)
- Modify: `src-tauri/src/lib.rs` (`patch_cli_settings`, `AppState`)
- Test: Rust unit tests for cap, whitelist, and lock helper

**Interfaces:**
- Consumes: existing `write_config_text`, `patch_cli_settings`
- Produces: `pub(crate) const CONFIG_TEXT_MAX: usize = 512 * 1024;`
- `AppState` gains `pub(crate) config_write: tokio::sync::Mutex<()>` (or a dedicated `ConfigLock` in `AppState`). Both `write_config_text` and `patch_cli_settings` acquire it for the whole read-modify-write.
- `patch_cli_settings` rejects unknown top-level JSON keys. Allowed keys (verbatim): `model`, `effort`, `permissionMode`, `yolo`, `showThinking`, `telemetry`, `memory`, `compactPercent`, `mcp`. Extra keys → `AppError::Message("不支持的设置字段".into())`.

- [ ] **Step 1: Tests** for `CONFIG_TEXT_MAX == 524288`; text of 524289 bytes is rejected; patch with key `"__proto__"` or `"unknown"` errors; patch with only `"model"` succeeds in a temp file helper if you extract `apply_cli_patch(doc, patch) -> Result<()>`.
- [ ] **Step 2: FAIL**
- [ ] **Step 3: Implement mutex + cap + whitelist. `write_config_text` uses the same cap.**
- [ ] **Step 4: PASS cargo test**
- [ ] **Step 5: Commit** `fix: serialize config.toml writes and cap patch fields`

---

### Task 5: open_review_path TOCTOU and open_path injection

**Files:**
- Modify: `src-tauri/src/lib.rs` (`validate_review_open_target`, `open_command`, `open_path`, `open_review_path`)

**Interfaces:**
- `open_command` on Linux must be `("xdg-open", vec!["--".into(), target.as_os_str().to_owned()])`.
- Windows: do not pass the path as a switch. Use `("cmd", vec!["/c".into(), "start".into(), "".into(), target.as_os_str().to_owned()])` or `osascript`-free `ShellExecute` equivalent already used — if still `explorer`, keep literal path only and reject paths starting with `-` or `/`. Prefer `cmd /c start "" --` is invalid on Windows; use `std::process::Command::new("explorer")` with a single canonical path that does not start with `-`.
- `validate_review_open_target`: after policy checks, `symlink_metadata` the path; if symlink, error `"Review 目标不能是符号链接"`. Then open with `O_NOFOLLOW` (unix) to confirm, or compare `symlink_metadata` ino with `metadata` ino. Do not return a path that was canonicalized through a symlink replace window — operate on the original absolute path under the trusted root using `is_under` on the **un-followed** join of root + relative, or lstat each component.

Recommended helper:

```rust
fn reject_symlink(path: &Path) -> AppResult<()> {
    let meta = std::fs::symlink_metadata(path).map_err(|_| AppError::Message("Review 目标不存在".into()))?;
    if meta.file_type().is_symlink() {
        return Err(AppError::Message("Review 目标不能是符号链接".into()));
    }
    Ok(())
}
```

Still require the resolved target (via `canonicalize` of a verified non-symlink) to be `is_under` the trusted root.

- [ ] **Step 1: Extend `launcher_arguments_are_platform_specific_and_literal` so Linux args start with `--`. Add `validate_review_open_target` test: symlink to a file outside the workspace is rejected.**
- [ ] **Step 2: FAIL**
- [ ] **Step 3: Implement**
- [ ] **Step 4: PASS cargo test**
- [ ] **Step 5: Commit** `fix: stop symlink escape and launcher arg injection`

---

### Task 6: grok argv whitelist, attachment checks, audit log

**Files:**
- Modify: `src-tauri/src/cli_bridge.rs` (`grok_args_allowed`, add `grok_argv_ok`)
- Modify: `src/lib/attachments.ts` + `src/lib/attachments.test.ts`
- Create: `src-tauri` audit helper used by `write_allowed_text` / `write_config_text` / `open_path` — append one JSON line to `grok_home().join("desktop-audit.jsonl")` with `{ts, op, path}` (no file bodies). Cap file at 2MB by truncating oldest on next write if larger (simple: if metadata len > 2MB, rotate to `.1`).
- Backend command or existing send path: validate attachment paths exist, size ≤ 20 * 1024 * 1024, and `is_under` workspace or grok home. If there is no backend attach command, add `validate_attachment(path, allow_root)` invoked from the existing write/read path the composer uses — inspect `src/lib/attachments.ts` `rejectAttachment` and extend it; add a Tauri command `stat_attachment` if size/existence cannot be known in the webview.

**Interfaces:**
- `fn grok_argv_ok(args: &[String]) -> bool`: head still in the existing subcommand list; every later arg that starts with `--` must match `^--[a-zA-Z0-9][a-zA-Z0-9-]*$` (optional `=value` with no spaces). Reject `--`, `--foo bar` as a single token with space, and `--$(id)`. Path-like values (args not starting with `-`) must not be `..` path components when they look like paths (`/` or `.` present).
- `ATTACHMENT_BYTE_CAP = 20 * 1024 * 1024`

- [ ] **Step 1: Tests** for `grok_argv_ok(&["inspect", "--json"])` true; `["inspect", "--;rm"]` false; `["mcp", "--"]` false. Attachment reject over 20MB. Audit helper writes a line.
- [ ] **Step 2: FAIL**
- [ ] **Step 3: Implement; `run_grok` / `run_grok_stream` use `grok_argv_ok`.**
- [ ] **Step 4: PASS npm test + cargo test**
- [ ] **Step 5: Commit** `fix: tighten grok argv and attachment path checks`

---

### Task 7: ACP event union and applyChatUpdate tests

**Files:**
- Modify: `src/lib/chat.ts`, `src/lib/chat.test.ts`
- Create: `src/lib/acp-events.ts`, `src/lib/acp-events.test.ts`
- Modify: `src/api.ts` — `readSessionUpdates` return type becomes `AcpRecord[]` not `unknown[]` if that is a one-line change; otherwise parse at the hydrate boundary.

**Interfaces:**
- Produces:

```ts
export type AcpSessionUpdate =
  | { sessionUpdate: "user_message_chunk"; content?: unknown; _meta?: unknown }
  | { sessionUpdate: "agent_message_chunk"; content?: unknown; _meta?: unknown }
  | { sessionUpdate: "agent_thought_chunk"; content?: unknown }
  | { sessionUpdate: "tool_call"; toolCallId?: string; [k: string]: unknown }
  | { sessionUpdate: "tool_call_update"; toolCallId?: string; [k: string]: unknown }
  | { sessionUpdate: "plan"; [k: string]: unknown }
  | { sessionUpdate: "available_commands_update"; [k: string]: unknown }
  | { sessionUpdate: "current_mode_update"; [k: string]: unknown }
  | { sessionUpdate: "session_info_update"; [k: string]: unknown }
  | { sessionUpdate: "turn_completed"; [k: string]: unknown }
  | { sessionUpdate: string; [k: string]: unknown };

export type AcpRecord = { update?: AcpSessionUpdate; _ts?: number; params?: unknown; [k: string]: unknown };

export function parseAcpRecord(raw: unknown): AcpRecord | null;
```

- `applyChatUpdate` takes `Record<string, unknown>` still but tests cover: streaming merge of two `agent_message_chunk` into one item; `skipUser`; usage `turn_completed` does not drop text (usage is in `token-usage.ts` — add tests in `chat.test.ts` that two chunks concatenate and a `tool_call` then `tool_call_update` merges). Constants: keep `MAX_FS_BYTES` documented in a shared TS const if missing — add `export const CONFIG_TEXT_MAX = 512 * 1024` only if not duplicating Rust; TS may export `ATTACHMENT_BYTE_CAP` from attachments (Task 6).

- [ ] **Step 1: Failing tests** for `parseAcpRecord` null on non-objects; `applyChatUpdate` concatenates chunks; tool update merges by id.
- [ ] **Step 2: FAIL**
- [ ] **Step 3: Implement union + switch on `sessionUpdate` instead of `asRecord` soup where easy. Keep behavior identical.**
- [ ] **Step 4: PASS `npm test -- src/lib/chat.test.ts src/lib/acp-events.test.ts`**
- [ ] **Step 5: Commit** `feat: type ACP session updates`

---

### Task 8: Split App.tsx hooks

**Files:**
- Create: `src/hooks/useAcpSession.ts`
- Create: `src/hooks/useGitWatcher.ts`
- Create: `src/hooks/usePermissionQueue.ts`
- Create: `src/hooks/useCommandPalette.ts`
- Create: `src/hooks/useAcpSession.test.ts` (extract pure helpers if the hook is thick — at minimum test exported helpers)
- Modify: `src/App.tsx` to call the hooks. App.tsx stays the shell (layout, routing, composition). Target: App.tsx under 800 lines if possible; if not, under 1600 with hooks owning RPC/session.

**Interfaces:**
- `useAcpSession` owns: `ensureAgent`, `rpc`, session load/hydrate calls, `busy`/`ready`/`connecting`, `chat`/`setChat`, `sessionId`.
- `useGitWatcher` owns: git log/branch poll **until Task 14 replaces poll**. Keep the 4s interval but move it here.
- `usePermissionQueue` owns: `permissions` state and respond handlers (see `src/lib/permission-queue.ts`).
- `useCommandPalette` owns: palette open/query/items/execute (see `src/lib/palette.ts`).

Do not add virtual list here. Do not split CSS. Do not split Composer.

- [ ] **Step 1: Identify the four clusters in App.tsx; write a small test for any helper you extract (e.g. palette item builder already in App — move to `src/lib/palette.ts` if duplicated).**
- [ ] **Step 2: FAIL if new helper tests added**
- [ ] **Step 3: Move code; App imports hooks. `npx tsc -b` must pass.**
- [ ] **Step 4: `npm test` + tsc**
- [ ] **Step 5: Commit** `refactor: extract App session git permission palette hooks`

---

### Task 9: Split Composer.tsx

**Files:**
- Create: `src/components/ComposerChips.tsx`
- Create: `src/components/MentionMenu.tsx`
- Create: `src/components/SlashMenu.tsx`
- Create: `src/components/QueueStrip.tsx`
- Modify: `src/components/Composer.tsx` to compose them. Public `Composer` / `ComposerHandle` / `ComposerProps` stay stable.

**Interfaces:**
- MentionMenu: props `{ open, items: MentionHit[], active, onPick, onHover }`
- SlashMenu: props `{ open, items: CommandDef[], active, onPick }`
- QueueStrip: existing queue UI from Composer
- ComposerChips: mode / effort / model chips

- [ ] **Step 1: If you extract a pure `mentionMenuVisible(query: string): boolean`, test it. Otherwise a smoke test that Composer still exports the handle type (TS compile is the gate).**
- [ ] **Step 2–4: Split, tsc, npm test**
- [ ] **Step 5: Commit** `refactor: split Composer menus and chips`

---

### Task 10: Split styles.css by feature

**Files:**
- Create: `src/styles/tokens.css`, `src/styles/sidebar.css`, `src/styles/thread.css`, `src/styles/composer.css`, `src/styles/settings.css`, `src/styles/review.css`
- Modify: `src/styles.css` to `@import` those files (Vite supports CSS `@import`) **or** import them from `src/main.tsx` in this order: tokens, styles remainder, sidebar, thread, composer, settings, review.
- Move rules by comment section / class prefix: `:root` and `[data-theme]` → tokens; `.sidebar` → sidebar; `.thread` `.md` `.chat` → thread; `.composer` `.mention` `.slash` → composer; `.settings` `.set-` → settings; `.review` `.diff` `.rewind` → review.
- Do not restyle. Visual output must match.

- [ ] **Step 1: Snapshot class-name prefixes you will move; no functional test required beyond `npm test` and that `src/main.tsx` still imports CSS.**
- [ ] **Step 3: Split. Each new file should stay under 800 lines.**
- [ ] **Step 5: Commit** `refactor: split styles.css into feature sheets`

---

### Task 11: Incremental session updates

**Files:**
- Modify: `src-tauri/src/lib.rs` `read_session_updates`
- Modify: `src/api.ts`
- Modify: `src/lib/chat.ts` `hydrateFromUpdates` — add `hydrateFromUpdates(rows, prev?: ChatState): ChatState` that can continue from `prev.nextId` when rows are a suffix
- Modify: session load in `useAcpSession` / App

**Interfaces:**
- `read_session_updates(session_id, after_byte: Option<u64>)` returns `{ rows: Vec<Value>, nextByte: u64, truncated: bool }`. If `after_byte` is set, seek there and only parse new lines. First load may cap at last **4 * 1024 * 1024** bytes of the file (read the tail) and set `truncated: true` when skipped prefix exists.
- Frontend: keep `nextByte` per session id; on reload, pass it. Full hydrate still works when `after_byte` is 0.

- [ ] **Step 1: Rust test with a temp jsonl: write 3 lines, read all, read after first line's byte offset, get 2 rows.**
- [ ] **Step 2: FAIL**
- [ ] **Step 3: Implement seek + frontend cache map `sessionId -> nextByte`.**
- [ ] **Step 4: cargo test + npm test**
- [ ] **Step 5: Commit** `perf: load session updates incrementally`

---

### Task 12: Memo, markdown cache, virtual list

**Files:**
- Modify: `src/components/Thread.tsx`, `src/components/Markdown.tsx`, `src/lib/markdown.ts`
- Create: `src/lib/markdown-cache.ts`, `src/lib/markdown-cache.test.ts`
- Add dep: `react-window` (and types if needed)

**Interfaces:**
- `memoizeMarkdown(text: string, cwd: string, toSrc: ...): string` — cache key `${cwd}\0${text}`, LRU max **80** entries.
- Streaming: only the last assistant item is non-memo; completed items use cache.
- `ChatRow` / `Markdown` wrapped in `React.memo`.
- `groupWorkRuns` result memoized with `useMemo` deps `[chat.items]`.
- Virtualize when `blocks.length > 80` using `react-window` `List`. Overscan **8**. Below 80, keep the current DOM (no virtualizer) so short chats do not jump.

- [ ] **Step 1: Tests** that cache returns same HTML for same key and evicts at 81st unique key (oldest gone).
- [ ] **Step 2: FAIL**
- [ ] **Step 3: Implement memo + cache + virtual list.**
- [ ] **Step 4: npm test**
- [ ] **Step 5: Commit** `perf: memo chat rows and virtualize long threads`

---

### Task 13: Agent warmup and deferred preload

**Files:**
- Modify: `src/hooks/useAcpSession.ts` or `src/App.tsx` (`ensureAgent`)
- Modify: billing poll interval
- Modify: startup effects that load usage / managed / agents

**Interfaces:**
- UI renders immediately (`ready` can be false). `startAgent` is kicked off in `useEffect` on mount without blocking first paint. `initialize` RPC runs after `startAgent` resolves; composer `blocked` stays true until initialize succeeds.
- Extract `ensureAgent` so it is a no-op if already initialized (idempotent). Guard React Strict Mode double-invoke with a module-level `let agentBoot: Promise<void> | null`.
- Billing: poll every **120_000** ms, and also on window focus / when usage settings page opens. Remove the 10_000 ms interval.
- Usage history, managed config, agents list: load after first idle (`requestIdleCallback` with 2s timeout fallback) or when those pages open, not on initial critical path.

- [ ] **Step 1: Test a tiny `shouldBlockComposer(connecting, initialized): boolean` helper.**
- [ ] **Step 3: Implement.**
- [ ] **Step 5: Commit** `perf: warm agent in background and defer billing`

---

### Task 14: Filesystem events, caches, throttles, abort

**Files:**
- Modify: `src-tauri/src/cli_bridge.rs` (`workspace_mtime`, `list_memory_changes`, `list_sessions`, `list_project_roots`)
- Modify: `src-tauri/src/lib.rs` (`save_webui_state`)
- Modify: `src/hooks/useGitWatcher.ts`, `src/hooks/useReviewController.ts`
- Add: `notify` crate (latest 7.x) to `src-tauri/Cargo.toml`

**Interfaces:**
- New command `watch_workspace(cwd: String)` starts a `notify` watcher on cwd (recursive, ignore `node_modules|.git|target|dist|.next`) and emits Tauri event `workspace-changed` with `{ cwd, at }`. Debounce **300** ms in Rust or frontend.
- Frontend: listen `workspace-changed` instead of 4s `workspace_mtime` poll. Keep a 30s mtime fallback if watch fails.
- Same event (or `memory-changed`) for `~/.grok` memory files used by `listMemoryChanges`.
- `list_sessions` / `list_project_roots`: cache in `OnceLock<Mutex<Cache>>` keyed by dir mtime of `grok_home()/sessions`; invalidate when that mtime changes.
- `save_webui_state`: keep last serialized string; skip write if identical. Frontend already persists often — also debounce **500** ms in the existing persist effect.
- Every `setInterval` / `setTimeout` in files you touch must return a cleanup. Audit `App.tsx`, `Thread.tsx`, Settings if still polling.
- `useReviewController`: on sessionId change, abort in-flight work (`AbortController`) and memoize derived lists.

- [ ] **Step 1: Test cache hit helper; test save skip when string equal.**
- [ ] **Step 3: Implement watcher + caches.**
- [ ] **Step 5: Commit** `perf: watch workspace and throttle webui writes`

---

### Task 15: Lazy mermaid

**Files:**
- Modify: `src/components/Markdown.tsx` (or mermaid component)
- Create: `src/lib/mermaid-once.ts`

**Interfaces:**
- `export function loadMermaid(): Promise<typeof import("mermaid")>` — `import("mermaid")` once, cache the module promise.
- Render mermaid only when a fence `language === "mermaid"` is present. `React.lazy` a `MermaidBlock` wrapped in `Suspense`. Cache rendered SVG by source hash (Map, max 40).

- [ ] **Step 1: Test the SVG cache helper.**
- [ ] **Step 3: Dynamic import; mermaid not in the critical Markdown path.**
- [ ] **Step 5: Commit** `perf: load mermaid on demand`

---

### Task 16: Preview highlight, tabs, find, image pan, save feedback

**Files:**
- Modify: `src/components/PreviewPane.tsx`, `src/lib/preview.ts`, `src/lib/preview.test.ts`
- Create: `src/lib/highlight.ts`, `src/lib/highlight.test.ts`
- Create: `src/components/PreviewTabs.tsx` if needed
- Modify: review rail / App preview state in `useReviewController.ts`

**Interfaces:**
- Highlight languages: `ts`, `tsx`, `js`, `jsx`, `py`, `rs`, `json`, `md`. Tokenize with a **small regex highlighter** in `highlight.ts` (no Prism/Shiki). Return `Array<{ text: string; kind: "kw" | "str" | "cmt" | "plain" }>`.
- Line numbers: render a gutter `1..n` matching split lines.
- Tabs: `PreviewTab[] = { path: string }[]` in review state, max **8** tabs, switching does not unload others' text cache (Map path → { text, mtime }).
- Find: Ctrl/Cmd+F in preview focuses an input; highlight matches; Enter / Shift+Enter next/prev. State in `src/lib/preview-find.ts` with tests.
- Images: wheel zoom 0.25–8; pointer drag pan. CSS `transform`.
- Save: toast success/failure (use existing `showToast` / toast state). After successful save, call the same git refresh function `useGitWatcher` exposes (`refresh()`).

- [ ] **Step 1: highlight + find tests**
- [ ] **Step 3: UI**
- [ ] **Step 5: Commit** `feat: multi-tab preview with highlight and find`

---

### Task 17: File tree and untracked contents

**Files:**
- Modify: `src-tauri/src/cli_bridge.rs` `list_file_tree` if it is flat — return `{ path, name, dir: bool, children?: ... }` depth **3** default or keep flat paths and nest in TS
- Modify: `src/lib/miller.ts` / mention file pickers / `FilePanel.tsx`
- Modify: `src/components/ChangesPanel.tsx` for untracked: clicking a file opens preview of contents (read_text_file) instead of only counts

**Interfaces:**
- `export function nestPaths(paths: string[]): TreeNode[]` with `type TreeNode = { name: string; path: string; children?: TreeNode[] }`
- Untracked: reuse preview open action.

- [ ] **Step 1: nestPaths tests**
- [ ] **Step 5: Commit** `feat: nested file tree and untracked preview`

---

### Task 18: Git commit, branch hint, blame, worktree cleanup

**Files:**
- Modify: `src-tauri/src/cli_bridge.rs` (add `git_commit`, `git_blame`, `git_status_untracked`)
- Modify: `src/components/GitBar.tsx`, `src/components/PreviewPane.tsx`
- Modify: project path persistence in App / `src/lib/projects.ts`

**Interfaces:**
- `git_commit(cwd, message: String)` runs `git add -A` then `git commit -m` **only inside `guard_repo_cwd`**. Reject empty/whitespace message. Return `{ ok, code, stderr }`.
- UI: message field + button "提交" on GitBar / ChangesPanel.
- After `git checkout` / branch switch (existing UI): if `session.cwd` worktree branch ≠ new branch, toast `当前会话绑定另一条分支`.
- Blame: preview gutter optional toggle; command `git blame -L {line},{line} -- path`.
- On project list load, drop saved paths whose directory no longer exists (`std::path::Path::is_dir`).

- [ ] **Step 1: TS tests for empty commit message rejection helper `commitMessageOk(msg: string): boolean`**
- [ ] **Step 3: Commands + UI. Do not build a full git client.**
- [ ] **Step 5: Commit** `feat: one-click git commit and blame gutter`

---

### Task 19: Session UX (summary, rename, batch, outline, export, drafts, rail, titles)

**Files:**
- Modify: `src/lib/projects.ts` (`displayTitle` fallback)
- Modify: `src/components/Sidebar.tsx`, `src/components/Thread.tsx`, `src/App.tsx` / hooks
- Modify: `src/lib/session-drafts.ts` (already exists — persist no-session draft)
- Create: `src/lib/session-summary.ts`, `src/lib/session-io.ts` + tests
- Create: `src/components/SessionOutline.tsx`

**Interfaces:**
- Summary: when user+assistant turns > **10**, show a collapsible banner at thread top. `summarizeThread(items: ChatItem[]): string` — first user text (120 chars) + last assistant (120 chars), no extra model call.
- Rename: double-click sidebar title enters existing `editingTitleId` flow (wire if missing).
- Batch: Shift/Cmd click selects multiple session ids; toolbar actions delete / mark read / archive.
- Outline: list user turns; click jumps (`jumpTurnId` already exists).
- Export: download `.md` and `.json` of `{ summary, items }`; import JSON restores a local-only transcript into chat state (does not call ACP create unless easy — import as **view-only** chat items is enough).
- No-session composer draft: persist under `sessionDrafts[""]` or `sessionDrafts["__none__"]` in webui state (reuse `sessionDrafts`).
- Review rail last tab per session: `Record<sessionId, railTab>` in webui state.
- `displayTitle`: if no override and `s.title` empty, use first 40 chars of first user message from a provided `preview?: string` map, else `"未命名会话"`.

- [ ] **Step 1: Tests for summarizeThread, displayTitle fallback, draft key `__none__`.**
- [ ] **Step 5: Commit** `feat: session summary rename export and draft persistence`

---

### Task 20: Rewind type-to-confirm and binary skip

**Files:**
- Modify: `src/components/RewindDialog.tsx`, `src/lib/checkpoint.ts`, rewind tests

**Interfaces:**
- Confirm button disabled until input (case-insensitive) equals `rewind`. Placeholder `输入 rewind 确认`.
- Rows whose restored content is binary or `> 2 * 1024 * 1024` chars: show `将跳过（二进制或超过 2MB）` and exclude from restore. Helper `export function rewindSkipReason(row: RevertPreviewRow): "binary" | "too_large" | null` — binary if contains `\0` or `text` is empty and kind isn't delete.

- [ ] **Step 1: Tests for skip reason and confirm phrase**
- [ ] **Step 5: Commit** `fix: require rewind confirmation and skip huge binaries`

---

### Task 21: i18n, ErrorBoundary, permissions, trust confirm

**Files:**
- Modify: `src/lib/i18n.ts`, `src/lib/i18n.test.ts`
- Create: `src/components/ErrorBoundary.tsx`
- Modify: `src/main.tsx` to wrap `<ErrorBoundary><App /></ErrorBoundary>`
- Modify: permission card UI (`src/lib/permission-queue.ts` / the component that renders the card)
- Modify: `trust_folder` UI in App/Settings

**Interfaces:**
- Add keys for every user-visible string in `Sidebar.tsx`, `Composer.tsx`, `GitBar.tsx`, `Thread.tsx`, `Settings.tsx` chrome (buttons, titles, empty states). Both ZH and EN. Test: `Object.keys(ZH).sort()` equals `Object.keys(EN).sort()` and `t("en", key) !== t("zh", key)` for at least 20 keys.
- ErrorBoundary: `getDerivedStateFromError`, render a panel `出了点问题` / `Something went wrong` + `重试` that sets state error=null.
- Permission: checkbox `此会话内记住` stores allow-list in memory `Set<toolName>` for the session id; auto-approve matching later cards.
- Timeout: keep 90s but show a countdown and a button `允许这次` that still works until timeout. Label the timeout as `将在 Ns 后拒绝`.
- Trust folder: require `tapDanger` double-confirm using existing `src/lib/confirm.ts` (already used elsewhere). Dangerous names: `/`, `$HOME`, `$HOME/Desktop`, `$HOME/Downloads` — extra copy `这是危险目录`.

- [ ] **Step 1: i18n key-parity test; ErrorBoundary render test not required if no RTL — a tiny `fallbackCopy(locale)` helper is enough.**
- [ ] **Step 5: Commit** `feat: i18n parity error boundary and calmer permissions`

---

### Task 22: Mentions with content, palette frecency, palette keyboard

**Files:**
- Modify: `src/lib/mentions.ts`, `src/lib/palette.ts`, Composer mention menu
- Create: `src/lib/frecency.ts`, `src/lib/frecency.test.ts`

**Interfaces:**
- Mention menu checkbox `附带内容` — when picking a file, if checked, read text (existing read API, cap **100_000** chars) and insert a fenced block not just `@path`.
- `frecencyScore(uses: number, lastAt: number, now: number): number` = `uses / (1 + (now - lastAt) / 86_400_000)`
- Palette items store `id`; on execute, bump use in `localStorage` key `grok.palette.frecency` JSON `{ [id]: { uses, lastAt } }`. Sort filtered items by frecency then existing score.
- Confirm CommandPalette: ArrowUp/Down change active index; Enter executes; Escape closes. If already implemented, add tests on a reducer `paletteKey(state, key): next`.

- [ ] **Step 1: frecency + paletteKey tests**
- [ ] **Step 5: Commit** `feat: mention file contents and palette frecency`

---

### Task 23: Accessibility live region, contrast, focus trap, sidebar aria

**Files:**
- Modify: `src/components/Thread.tsx`, `src/styles/tokens.css` or `src/styles.css`, command palette component, `src/components/Sidebar.tsx`

**Interfaces:**
- Thread: `aria-live="polite"` on a visually-hidden node that mirrors the latest assistant text **throttled to 1s**.
- Contrast: `.usage-chip` and similar light chips — text color contrast ≥ 4.5:1 against background. Encode as CSS variables `--usage-fg` / `--usage-bg` with values `#1a1a1a` on `#e8e4da` (light) and `#f4f0e8` on `#3a3530` (dark) or equivalent AA pairs.
- Palette / menus / preview dialogs: on open, focus first control; on close, restore `previousActive`. Tab cycles inside `role="dialog"`. Helper `trapFocus(container, event)`.
- Sidebar: `role="tree"` or grouped `role="list"` with `aria-label="会话"`; Tab moves between project groups.

- [ ] **Step 1: trapFocus unit test with a mock cycle**
- [ ] **Step 5: Commit** `fix: live regions contrast and focus trapping`

---

### Task 24: Modal, process cleanup, gitignore, terminal, usage charts, chrome

**Files:**
- Create: `src/components/AppModal.tsx` — replace `window.confirm` call sites in App/Settings with it (title, body, confirm, cancel). Uses existing `palette-layer` styles.
- Modify: `src-tauri/src/lib.rs` — on `RunEvent::Exit` / window close, `stop_agent_inner`; already may exist — ensure `kill_on_drop` plus explicit kill.
- Modify: `.gitignore` — add `*.tsbuildinfo`, `dist`, `src-tauri/target`, `*.dmg`, `*.app`, `*.msi`, `*.exe` if missing.
- Modify: `open_in_terminal` in `cli_bridge.rs` — macOS Terminal.app keep; Linux `x-terminal-emulator` or `xdg-terminal-exec` with cwd; Windows `cmd /c start cmd /k cd /d`.
- Modify: `src/components/UsageStats.tsx` / `StatsLineView.tsx` — sparkline time series from `usageHistory`; cost split by `model` using `src/lib/usage-split.ts` (extend).
- Badge: count only sessions that need user input (existing `statusFor` / inbox). Completed runs use a small idle dot, not the numeric badge.
- Connection chip: CSS `transition: opacity 160ms, background-color 160ms` on connecting/ready.

**Interfaces:**
- `AppModal` props `{ open, title, body, confirmLabel, onConfirm, onCancel }`
- `splitCostByModel(ticks: { model?: string; cost: number }[]): Record<string, number>`

- [ ] **Step 1: usage-split tests; gitignore assertions via reading the file in a vitest optional — skip if awkward; test splitCostByModel.**
- [ ] **Step 5: Commit** `feat: app modal process cleanup usage split and gitignore`

---

## Self-review coverage

Every P0/P1/P2 id in the optimization doc maps to a task in the Item → Task map. P3 ids are excluded by Global Constraints.
