# Handoff — secondary development

This document is the map you need to fork, patch, or add a fifth ACP agent without fighting the architecture.

If a sentence here disagrees with [the locked spec](superpowers/specs/2026-08-30-multi-agent-acp-workbench-design.md), the spec wins. If the spec disagrees with running code, the code wins — then update this file.

## Product contract

The desktop is a **workbench**, not an agent.

- Chat, sessions, permissions, settings, Git, and review stay on `AgentPort`.
- Skills and MCP are a **single** catalog at `~/.agents`, then synced into each CLI. Do not build four hub UIs.
- `AgentId` is a closed enum today: `"grok" | "kimi" | "claude" | "codex"`.
- Grok chat is the regression fixture. Extract, do not rewrite, its ACP/session loop.
- Imagine / video, plugin marketplaces, and in-app PTY are out of scope unless a later spec says otherwise.

## Layout

```
src/                    React 19 + TypeScript (Vite)
  App.tsx               Shell: sidebar, thread, rails, overlays
  api.ts                Tauri invoke + ACP events
  hooks/useAcpSession.ts Live session bind / resume / send / permissions
  hooks/useAppModel.ts  Desktop chrome state (theme, layout, doctors)
  lib/agent-port.ts     AgentPort { start, stop, send }
  lib/agent-id.ts       Closed AgentId
  lib/state-authority.ts Which keys live in webui.json vs config.toml vs ACP
  components/           Presentational UI
  styles/               Tokens + pane CSS
src-tauri/src/
  lib.rs                Tauri commands, AppState
  agent_host.rs         Process pool: one ACP child per AgentId
  acp_loop.rs           stdin/stdout JSON-RPC reader/writer
  adapters.rs           Spawn argv + doctor homes
  agent_registry.rs     Optional TOML override for spawn
  session_scan.rs       Per-CLI session catalogs
  session_replay.rs     History → chat items
  rpc_allowlist.rs      Capability-gated RPC
  cli_bridge.rs         Git, fs, config, notifications
docs/HANDOFF.md         This file
```

Tests sit next to the module they pin: `src/lib/foo.ts` → `src/lib/foo.test.ts`. Prefer that over a `/tests` tree.

## Runtime path

1. UI picks `{ agentId, sessionId, cwd }`.
2. `portFor(agentId).start()` → Tauri `start_agent`.
3. `AgentHost` reuses or spawns **one** stdio child for that `agentId` (not one child per session). Grok already multiplexes `session/new` on a single process; others follow.
4. JSON-RPC frames go through `acp_loop`. Events are tagged `{ agentId, generation, payload }` so a stale process cannot paint the wrong pane.
5. `useAcpSession` folds `session/update` into `ChatState` (batched). Permissions, usage, and tool rows are derived — they are not a second source of truth.
6. A split pane that binds two agents starts **two** children. A session never rides another agent’s process.

Spawn defaults (overridable via registry TOML):

| AgentId | Command |
| --- | --- |
| grok | `grok agent stdio` |
| kimi | `kimi acp` |
| claude | `npx -y @agentclientprotocol/claude-agent-acp@0.70.0` |
| codex | `npx -y @agentclientprotocol/codex-acp@1.7.0` |

## State authority

Do not invent a fourth store. `authorityForState` in `src/lib/state-authority.ts` is the checklist:

| Kind | Lives in | Examples |
| --- | --- | --- |
| desktop-preferences | `~/.grok/webui.json` (workbench chrome) | theme, pins, drafts, sidebar width, locale |
| cli-defaults | that CLI’s `config.toml` | model, effort, permissionMode, compactPercent |
| session-runtime | ACP / session files | messages, tool calls, pending permission, usage |

If a setting is a CLI default, write it through the adapter’s config patch — not only into `webui.json`.

## How to add an agent (checklist)

Stay mechanical. Copy Grok’s adapter shape; do not special-case the UI.

1. Extend `AgentId` in **both** `src/lib/agent-id.ts` and `src-tauri/src/agent_host.rs`. Keep the TS and Rust lists identical.
2. Add `default_spawn_profile` + `doctor_homes` entries in `adapters.rs` / `agent_host.rs`.
3. Teach `session_scan.rs` where that CLI writes session files. If it has no catalog, return an empty list — do not scrape another agent’s folder.
4. Extend `rpc_allowlist.rs` with methods the new CLI actually negotiates (`authenticate`, `session/list`, …). Default deny unknown methods.
5. Doctor: binary on `PATH`, auth kind (`subscription` vs `api` vs `none`). API key **wins** over subscription when both exist. Usage **ring** only for subscription.
6. Pin any `npx` ACP package **with a version**. Unpinned `@latest` is a supply-chain footgun.
7. Tests first: spawn argv, doctor DTO, session scan empty-on-missing-dir, allowlist.
8. UI should keep using `AgentPort` / `portFor(id)`. A new `if (agent === "…")` in `App.tsx` is usually a design smell.

## Subagents and session catalog

- Disk: Grok `subagents/meta.json`; Claude `<uuid>/subagents/agent-*.jsonl`; Kimi `agents/<id>` except `main`.
- Live: tool aliases in `src/lib/subagent.ts` (Task, Agent, spawn_subagent, swarm). Running tools become `live:{agentId}:{toolId}` nested rows. Never session/load those ids.
- Manifest: `src-tauri/src/agent_manifest.rs`. Spawn argv still `agents.toml` + `adapters.rs`.

## UI rules that save you a week

- **Chrome vs thread.** Layout, rails, composer dock, and overlays belong in `useAppModel` + `App.tsx`. Turn content belongs in `useAcpSession` + `Thread`.
- **No fake inventory.** If Codex has no hooks UI analog, show an empty/honest state. Do not render Grok’s plugin list under another brand.
- **Permissions are modal to the turn**, not a global toast. `PermissionCard` is the user-visible contract.
- **Git and explorer are agent-agnostic.** Keep them that way. They must not import `AgentId` unless they are tagging a session.
- CSS tokens live in `src/styles/tokens.css`. Compact density is ` :root[data-density="compact"] `. Do not delete those overrides — persisted compact users still hit them.
- Keyboard: `:focus { outline: none }` plus a visible `:focus-visible` ring. Do not disable outline on `textarea:focus-visible`.

## Commands you will actually run

| Command | Why |
| --- | --- |
| `npm test` | Vitest, the default gate |
| `npm test -- src/lib/<file>.test.ts` | Pin one module |
| `npm run typecheck` | `tsc --noEmit` |
| `npm run tauri dev` | Full desktop |
| `cargo test --manifest-path src-tauri/Cargo.toml <name> -- --nocapture` | Rust unit tests (`rpc_allowlist`, spawn, scan) |

CI runs `npm test` and `npm run typecheck` on every PR. Rust tests are still required locally for host/adapter changes.

## Security fences (do not weaken in a “quick fix”)

- Asset protocol denies `~/.ssh`, `~/.gnupg`, `~/.aws`, `auth.json`, kube/keychain paths (`tauri.conf.json`).
- Writes require a trusted workspace. RPC payloads go through the allowlist.
- Never log tokens, cookies, or credential files. The memory ingest path already redacts `sk-` / `ghp_` / `xai-` / `AKIA` shapes — keep that heuristic if you touch it.
- `MAX_FS_BYTES` and `CONFIG_TEXT_MAX` in `lib.rs` exist to stop the UI from slurping unbounded files.

## What not to do

- Spawn a new CLI process per session “to keep things simple”. You will leak children and mix events.
- Read `~/.cc-switch/cc-switch.db`. Copy the operating model (one catalog, per-app sync), not the database.
- Drive Git from the agent’s bash tool when `cli_bridge` already has `git_status` / `git_commit`. The pane should stay deterministic.
- Commit `.tmp-acp-probe/` or `.tmp-ui-check/`. Those are local probes.

## When you are stuck

1. Reproduce with `npm run tauri dev` and one CLI at a time.
2. Check doctor (`AgentDoctor`) before assuming ACP is broken — missing binary and missing auth look the same in the composer.
3. Watch tagged events: if `generation` does not match the pane, the UI should drop the frame (`shouldDropAcpEvent` in `src/lib/acp-host.ts`).
4. Open an issue with the [bug form](https://github.com/Stauch99/grok-build-desktop/issues/new?template=bug.yml). Automation will label it; a human still owns the call.
