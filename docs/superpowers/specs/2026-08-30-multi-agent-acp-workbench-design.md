# Multi-Agent ACP Workbench

Date: 2026-08-30
Status: approved
Product: current Grok Build Desktop → generic ACP workbench
Scope: Grok Build, Claude Code, Codex CLI, Kimi Code

## Goal

Make Grok one ACP backend among N. Chat, sessions, permissions, settings, and review stay on `AgentPort`. Skills and MCP are **not** per-CLI copies of Grok’s hub: they are a cc-switch-style unified manager whose source of truth is the global `~/.agents` folder, then synced into each CLI.

The desktop still does not own the agent runtime.

## Locked product decisions (2026-08-30)

1. **Skills / MCP** — unified manager (cc-switch pattern). Canonical store is `~/.agents` (global skills + global MCP). The hub edits that store and syncs into each enabled CLI. Do not maintain four separate skill/MCP UIs.
2. **Plugins / marketplace** — skills only. No plugin install, no Grok/Claude plugin marketplace. Hub “市场” is a skill catalog (GitHub / zip / folder), not `grok plugin`.
3. **Usage ring** — if doctor reports **subscription** login, show that CLI’s subscription quota ring. If auth is **API key**, do not poll or display a ring.
4. **Token stats** — record each CLI’s token usage from ACP. One brand switcher to view Grok / Kimi / Claude / Codex (plus “全部”).
5. **Imagine / video** — this round unchanged: keep today’s Grok path only. No other provider APIs, no workbench wave. Revisit later.

## 1:1 definition (locked)

1:1 is **chat + session + review parity** across the four CLIs, plus **one shared Skills/MCP plane**.

- **Same contracts.** UI talks only to `AgentPort` for sessions/ACP. Skills/MCP talk only to `AgentsStore` (`~/.agents`) plus a sync matrix.
- **Grok chat is the reference fixture.** Extract today’s ACP/session code into `GrokAdapter`; do not rewrite it.
- **Hub is shared, not Grok-shaped.** Skills, MCP, and skill marketplace are global. Plugin tabs and `grok plugin *` go away.
- **Honest empty** still applies to per-CLI admin that has no analog (hooks, personas). Do not fake plugin inventories.

Out of scope this round: plugins; imagine/video providers; embedding cc-switch or reading `~/.cc-switch/cc-switch.db`; in-app PTY; rewriting any CLI.

## Current coupling (must break)

| Layer | Today | Problem |
|---|---|---|
| Process | `start_agent` → `grok agent stdio`, one `AppState.session` | Cannot boot a second CLI |
| RPC | allowlist + `_x.ai/*`; test denies `session/set_mode` | Kimi/Claude/Codex need `authenticate`, `session/list`, `session/set_config_option` |
| Sessions | walk `~/.grok/sessions` | Other CLIs do not write that JSON |
| Admin | `run_grok` + `~/.grok/{config.toml,skills,hooks,agents}` | Hub/settings are Grok-shaped |
| UI state | `~/.grok/webui.json` | Pins/drafts must outlive a single CLI |
| Identity | `DoctorInfo.grokPath`, `GROK_LOGIN_CMD`, `~/Documents/Grok Chats` | Product is a Grok client |

Workspace chrome that is already agent-agnostic and stays shared: Git, file tree, preview, composer, permission cards, tool classification, worktree create, file rewind from known diffs.

## Architecture

```
React chrome (unchanged IA)
        │  SessionRef { agentId, sessionId }
        ▼
src/lib/agent-host.ts          Tauri invoke + tagged events
        │
        ▼
src-tauri AgentHost
  ProcessPool: HashMap<AgentId, AcpChild>
  Event: { agentId, generation, payload }
  RPC allowlist: negotiated capabilities ∪ adapter extras
        │
        ├─ AcpPort (stdio JSON-RPC)          ├─ AdminPort                 ├─ AgentsStore
        │  grok agent stdio                  │  sessions / doctor         │  ~/.agents/skills
        │  kimi acp                          │  models / settings         │  ~/.agents/mcp.json
        │  npx claude-agent-acp              │  usage / login             │  sync → each CLI
        │  npx codex-acp                     │  hooks / personas (native) │
        ▼                                    ▼
   GrokAdapter | KimiAdapter | ClaudeAdapter | CodexAdapter
```

Rules:

- One ACP child **per agentId**, not per session. Grok already multiplexes `session/new` on one process; others follow the same pattern.
- A session never rides another agent’s process. Split pane may bind two agents → two children.
- Grok adapter is a mechanical extract of today’s ACP/session/doctor/settings code. Behavior match is the regression bar.
- Skills/MCP are **not** adapter methods. They go through `AgentsStore` (see below). UI does not `if (agent === "grok")` for hub skills/MCP.
- Other adapters implement the same Rust trait + the same TS DTO for sessions/ACP/usage.

## AgentsStore — unified Skills / MCP (cc-switch pattern)

Do not vendor cc-switch or open `~/.cc-switch/cc-switch.db`. Copy the **operating model**: one catalog, per-app sync toggles, symlink-or-merge into each CLI’s live files.

Canonical layout:

```
~/.agents/skills/<name>/SKILL.md     # create / install / edit here
~/.agents/mcp.json                   # { servers: [{ name, transport, command|url, args, env, headers }] }
~/.agents/sync.json                  # { skills: { name: { grok, kimi, claude, codex } }, mcp: { ... } }
```

Project scope (same convention, repo-local): `<cwd>/.agents/skills/` and optional `<cwd>/.agents/mcp.json`. Hub can switch User / Project like today. Project MCP syncs only into that repo’s native files (`.mcp.json`, `.kimi-code/mcp.json`, `.grok/config.toml`), never into other projects.

### Skills

- Hub Skills tab lists `~/.agents/skills` (user) and `.agents/skills` (project). `create_skill` writes there, not `~/.grok/skills`.
- Marketplace tab installs a skill folder (GitHub repo, zip, or local dir) into `~/.agents/skills/<name>/`.
- Disable = `sync.json` flag off for that CLI, then remove that CLI’s link; the canonical folder stays.
- **Sync (user scope)** after each change, for each CLI with the toggle on:

  | CLI | Target | Method |
  |---|---|---|
  | Grok | none extra if Grok already scans `~/.agents/skills` (today’s inspect path). If a given Grok version only reads `~/.grok/skills`, symlink `~/.grok/skills/<name>` → canonical | prefer scan; symlink fallback |
  | Kimi | `~/.kimi-code/skills/<name>` | symlink (Kimi also documents `~/.agents/skills`; skip duplicate if probe shows it already scans) |
  | Claude | `~/.claude/skills/<name>` | symlink |
  | Codex | `~/.codex/skills/<name>` | symlink |

- Never copy-mutate SKILL.md on sync. The file in `~/.agents` is the only editor target.
- Existing `~/.grok/skills` / `~/.claude/skills` that are **not** symlinks into `~/.agents`: first hub open offers import (move-or-link). Do not delete silently.

### MCP

- Hub MCP tab edits `~/.agents/mcp.json` only. Add / enable / disable / remove live there.
- Each server has a per-CLI sync checkbox (default: all installed CLIs on).
- **Sync** merges that server into the CLI’s native config, using that CLI’s schema:

  | CLI | Live file | Write |
  |---|---|---|
  | Grok | `~/.grok/config.toml` or `grok mcp add` | merge `[mcp]` / equivalent; prefer the same argv Grok hub uses today if probe confirms |
  | Kimi | `~/.kimi-code/mcp.json` | merge JSON |
  | Claude | `~/.claude.json` `mcpServers` | merge JSON |
  | Codex | `~/.codex/config.toml` `[mcp_servers.*]` | merge TOML |

- Disable for one CLI removes that server from **that** live file only. Canonical `mcp.json` keeps the definition.
- Bidirectional import on first open: read each live file, union into `mcp.json` if a name is missing. Conflict (same name, different command): keep canonical, do not overwrite live until the user hits Sync.
- `session/new` `mcpServers` stays empty unless a future probe shows a CLI only honors ACP-forwarded MCP. Prefer live CLI config so the TUI and the desktop see the same servers.

### Hub chrome

Tabs: `skills` | `mcp` | `marketplace` | `hooks`.

- Remove `plugins` tab, `/plugins` slash, and all `grok plugin *` / marketplace-plugin commands.
- `marketplace` = skill catalog (install into `~/.agents/skills`).
- `hooks` stays per-CLI native (Grok `~/.grok/hooks`, Claude `settings.json` hooks). Not part of `~/.agents` this round.
- `/mcps` `/skills` `/marketplace` open this hub. `/plugins` aliases to `/skills` (no plugin UI).

### What we are not doing

- No plugin enable/disable/install/uninstall.
- No Grok plugin marketplace JSON, no Claude plugin marketplace.
- No SQLite SSOT. Files above are the SSOT (atomic write + backup like today’s config lock).

## Identity and storage

Desktop-owned home (new):

```
$ACP_WORKBENCH_HOME  (default ~/.acp-workbench)
  workbench.json          # migrated from ~/.grok/webui.json
  agents.toml             # enabled profiles, pins, overrides
  inbox/                  # default unbound-chat cwd
  pastes/                 # composer paste/drop cache (today: ~/.grok/sessions/pastes)
  usage/                  # ACP token turn log, tagged by agentId
  desktop-audit.jsonl
```

Global Skills/MCP store (shared with other tools, not desktop-private):

```
~/.agents/
  skills/<name>/SKILL.md  # Agent Skills spec; Grok already scans this
  mcp.json                # unified MCP catalog (stdio | http | sse)
  sync.json               # per-item enable matrix: which CLIs receive the sync
```

CLI homes stay with the CLIs:

| Agent | Home | ACP spawn | Admin CLI |
|---|---|---|---|
| `grok` | `GROK_HOME` or `~/.grok` | `{home}/bin/grok` `agent stdio` | `grok` |
| `kimi` | `KIMI_CODE_HOME` or `~/.kimi-code` | `kimi acp` | `kimi` |
| `claude` | `~/.claude` | `npx -y @agentclientprotocol/claude-agent-acp@<pin>` | `claude` |
| `codex` | `~/.codex` | `npx -y @agentclientprotocol/codex-acp@<pin>` | `codex` |

Pin npm adapter versions in `agents.toml` to the exact versions written down in Phase 0. Do not use floating `@latest` in packaged builds.

Migration: on first launch, if `~/.grok/webui.json` exists and `~/.acp-workbench/workbench.json` does not, copy it and set `lastAgent = "grok"`. Keep reading Grok sessions from `~/.grok`. Do not move CLI data.

Inbox: desktop-owned directory (default `~/Documents/Agent Chats`). Existing `~/Documents/Grok Chats` remains the inbox cwd for sessions that already live there. New unbound chats use the desktop inbox and the currently selected agent.

Product copy (Wave 5): bundle id and binary stay as they are until a separate rename pass. Window title, about screen, and empty-state noun become “ACP Workbench”. Account menu identity is `{agent label} · 已登录|未登录`. Grok login copy stays on the Grok profile only.

## Agent registry

`agents.toml` (desktop-owned):

```toml
[agents.grok]
enabled = true
command = ""          # empty → resolve like today
args = ["agent", "stdio"]
home = ""             # empty → ~/.grok
login = ["login"]

[agents.kimi]
enabled = true
command = "kimi"
args = ["acp"]
home = ""
login = ["login"]

[agents.claude]
enabled = true
command = "npx"
args = ["-y", "@agentclientprotocol/claude-agent-acp@<phase0-pin>"]
home = ""
login = ["login"]      # or adapter authenticate

[agents.codex]
enabled = true
command = "npx"
args = ["-y", "@agentclientprotocol/codex-acp@<phase0-pin>"]
home = ""
login = ["login"]
```

`AgentId` is a closed enum in v1: `grok | kimi | claude | codex`. Custom command overrides are allowed; new IDs are not.

Doctor becomes per-profile:

```ts
type AuthKind = "subscription" | "api" | "none";

type AgentDoctor = {
  agentId: AgentId;
  binary: string | null;
  version: string | null;
  home: string;
  authPresent: boolean;
  authKind: AuthKind;
  acpSpawnOk: boolean;
};
```

`authKind` rules (probe fills the exact files/env):

- **subscription** — native login session (Grok `auth.json` OAuth, `claude login`, `codex login` / ChatGPT, `kimi login`) and no overriding API key for that CLI.
- **api** — `ANTHROPIC_API_KEY` / `OPENAI_API_KEY` / `CODEX_API_KEY` / Grok or Kimi API key in config takes precedence over subscription for this classification.
- **none** — not logged in and no key.

Settings → 总览 lists all enabled profiles. Empty state on new chat is “install or log in to {agent}”, not a single Grok blurb.

If both subscription and an API key exist, classify as **api** (key wins). The ring stays off.

## Session model

```ts
type SessionRef = { agentId: AgentId; sessionId: string };

type SessionSummary = {
  agentId: AgentId;
  id: string;            // opaque, vendor-owned
  cwd: string;
  title: string;
  model?: string | null;
  agentName?: string | null;
  updatedAt: string;
  createdAt: string;
  numMessages: number;
  dir?: string | null;
  parentSessionId?: string | null;
  lastTurnSummary?: string | null;
  lastTurnSummaryPromptId?: string | null;
};
```

Sidebar shows a mixed list. Grouping gains an optional `agent` mode; default stays `project`. Each row has an agent pill. Pins, archives, drafts, unread, titles in `workbench.json` key by `agentId/sessionId` (today’s bare session ids migrate as `grok/<id>`).

Resume: `session/load` or `session/resume` on **that** agent’s child only. Never pass a Claude id to Grok.

Delete / move-to-cwd / full-text search: AdminPort per agent. Grok keeps filesystem delete. Others: native CLI if it exists, else delete the vendor session dir the catalog discovered, else return `unsupported` and keep the UI button (disabled with reason).

`readSessionUpdates` / usage / plan / spills: Grok reads `~/.grok/sessions/<id>/`. Other adapters map to their on-disk transcript if the probe finds one; otherwise replay depends on `session/load` history notifications (Kimi documents this). The TS chat folder already consumes ACP records — keep that as the live path; disk read is resume/cache.

## ACP host

Replace `AppState.session: Option<AgentSession>` with:

```rust
struct AcpChild {
    child: tokio::process::Child,
    tx: mpsc::Sender<String>,
    generation: u64,
    capabilities: AgentCapabilities,
}

struct AppState {
    children: Mutex<HashMap<AgentId, AcpChild>>,
    // workspace maps stay, keyed by SessionRef string
}
```

Events: `acp-message` / `acp-request` / `acp-stderr` / `agent-exit` payloads include `agentId`. Frontend drops messages whose `agentId` does not match the pane’s `SessionRef`.

`initialize` (every child, once):

```json
{
  "protocolVersion": 1,
  "clientCapabilities": {
    "fs": { "readTextFile": true, "writeTextFile": true },
    "terminal": false
  }
}
```

After probe (Phase 0), if Claude’s adapter requires terminal or subagent bits for 1:1 tool cards, advertise them. Do not guess in this spec — Phase 0 writes the exact initialize blob per agent into `docs/superpowers/specs/acp-probe/`.

RPC allowlist after initialize:

- Always: `initialize`, `authenticate`, `session/new`, `session/prompt`, `session/cancel`
- If advertised: `session/load`, `session/resume`, `session/list`, `session/set_mode`, `session/set_config_option`, `session/set_model`
- Adapter extras: Grok `_x.ai/*` only on the Grok child; never on others
- Responses (`id` + `result`/`error`) remain allowed

`session/new` params stay `{ cwd, mcpServers, _meta }`. Modes/models after new go through `session/set_config_option` when the agent advertised `configOptions`; Grok may keep `_meta` / `_x.ai` as today inside GrokAdapter only.

Auth: if `initialize` returns `authMethods` and doctor says `authPresent === false`, show the same account-menu unauthenticated state, with that profile’s `login` argv or ACP `authenticate`. Do not embed credentials in the desktop.

## AgentPort contracts

Two traits, one per agent. UI never calls `runGrok` / `inspectBrief` / `readCliSettings` directly.

### AcpPort

Spawn, stop, send, initialize handshake, capability cache. Shared host; adapters only supply `command`, `args`, `env`, `extra_allowed_methods`.

### AdminPort

Every current Tauri command that touches Grok home or `grok` argv for **sessions, doctor, settings, usage** becomes a method on this trait. Skills/MCP/create_skill are `AgentsStore`, not AdminPort. GrokAdapter implementations for the remaining methods are the current functions, moved.

| Method | Grok (reference) | Kimi | Claude | Codex |
|---|---|---|---|---|
| `doctor` | binary + `auth.json` → `authKind` | `kimi` creds → `authKind` | `~/.claude.json` vs `ANTHROPIC_API_KEY` | ChatGPT vs `OPENAI_API_KEY` / `CODEX_API_KEY` |
| `list_sessions` | scan `~/.grok/sessions` | ACP `session/list` + `~/.kimi-code/sessions` | `~/.claude/projects/**` and/or ACP list | Codex threads / `~/.codex` |
| `delete_session` | unlink session dir | native or dir delete | native or dir delete | native or dir delete |
| `read_session_updates` | session JSONL | Kimi session dir or live ACP | Claude project jsonl or live ACP | Codex dump or live ACP |
| `models` | `grok models` + cache | `configOptions` + `config.toml` | Claude model list / ACP | `codex` model list / ACP |
| `read/patch_settings` | `~/.grok/config.toml` | `~/.kimi-code/config.toml` | `~/.claude/settings.json` | `~/.codex/config.toml` |
| `hooks_read/write` | `~/.grok/hooks` | native or `unsupported` | Claude `settings.json` hooks | native or `unsupported` |
| `agents_dir` | `~/.grok/agents`, `personas` | Kimi agents / `AGENTS.md` | `~/.claude/agents` | `~/.codex/agents` |
| `memory_changes` | `~/.grok/memory` | native if present | Claude memory if present | native if present |
| `usage_quota` | `_x.ai/billing` **only if** `authKind === "subscription"` | subscription quota API/CLI only | Claude subscription usage only | Codex/ChatGPT subscription usage only |
| `usage_turns` | existing Grok turn files **and** desktop ACP recorder | desktop ACP recorder | desktop ACP recorder | desktop ACP recorder |
| `login_cmd` | `grok login` | `kimi login` | `claude login` / ACP authenticate | `codex login` |
| `search_session_text` | grep grok session files | grep kimi sessions | grep claude transcripts | grep codex transcripts |
| `config_text` | user/project `config.toml` | kimi `config.toml` | `settings.json` | `config.toml` |

Removed from AdminPort (this round): `mcp_*`, `plugins_*`, `marketplace_*` (plugin), `create_skill` (now AgentsStore), `imagine_artifacts` (no imagine wave).

Phase 0 probe **fills `authKind` detection and session paths**. Quota endpoints are probed only for subscription. API-key setups must return `usage_quota: null` without network calls.

## Usage

**Ring (quota).** Render only when `doctor.authKind === "subscription"` for the CLI currently selected on the usage page. Call `usage_quota(agentId)`. If `authKind` is `api` or `none`, hide the ring and do not request billing. Switching the brand switcher to an API-key CLI hides that ring immediately.

**Token stats.** On every ACP `session/update` that carries token usage, append `{ agentId, sessionId, cwd, model, input, output, cache*, total, at }` under `~/.acp-workbench/usage/`. Merge Grok’s existing turn files in as `agentId: grok` so history is not lost.

The usage overlay (today’s `UsageStats`) gets a **CLI brand switcher**: `全部 | Grok | Kimi | Claude | Codex`. It filters `usage_turns` by `agentId`. Model/cwd filters stay. Cost ticks only display when that CLI actually reported them; API mode still records tokens, it just has no ring.

Do not convert API traffic into a fake subscription percentage.

## Imagine / video (deferred)

Leave current Grok imagine/video overlays and `/imagine` `/imagine-video` as they are. No AgentsStore work, no other provider APIs, no adapter methods this round.

## UI mapping

| Screen | Binding |
|---|---|
| Sidebar | `AdminPort.list_sessions` union; row pill = `agentId` |
| New chat | `selectedAgentId` (composer chip + account menu) |
| Thread / Composer / permissions | `AcpPort` of that session’s agent |
| Model / effort / mode | `configOptions` or AdminPort settings or Grok `_meta` |
| Extensions hub | `AgentsStore` for skills/MCP/marketplace; hooks via AdminPort of **selected** agent |
| Settings → 总览 | all doctors including `authKind` |
| Settings → 扩展 | one door into hub |
| Agents overlay | `agents_dir` of selected agent |
| Memory overlay | `memory_changes` of selected agent |
| Imagine overlays | **unchanged Grok**; out of workbench waves |
| Usage overlay | brand switcher + token table; ring only if that brand is subscription |
| Slash extras | still from the live agent |
| Local slashes | `/skills` `/mcps` `/marketplace` → hub; drop `/plugins` |

Composer agent chip: next to model. Changing agent on an **existing** session is forbidden. Changing agent on empty composer starts the next `session/new` on that child.

## Frontend / backend split

Keep `App.tsx` as the owner of live session routing (existing P2 note). Changes:

1. `SessionRef` through `useAcpSession`, sidebar, split pane, permission queue, notify target.
2. `startAgent(agentId)` / `ensureAgent(agentId)` instead of a single boot.
3. `rpc(agentId, method, params)` so split-across-agents cannot leak.
4. Replace `src/lib/grok-cli.ts` MCP/plugin helpers with `src/lib/agents-store.ts` (skills/MCP/sync). Session/doctor helpers become `admin-port.ts`.
5. Replace `GROK_LOGIN_CMD` with `doctor.loginHint`.
6. `parseModelsList` stays as GrokAdapter’s parser, not a global.

Rust module layout:

```
src-tauri/src/
  agent_host.rs          # pool, spawn, stdio, tagged events, rpc allowlist
  agent_registry.rs      # agents.toml, resolve command, pins
  agents_store.rs        # ~/.agents skills + mcp.json + sync.json
  adapters/
    mod.rs               # AdminPort trait (no skills/mcp/plugin)
    grok.rs
    kimi.rs
    claude.rs
    codex.rs
  cli_bridge.rs          # shared FS/git/path policy
  lib.rs
```

Path policy (`is_blocked_path`, trusted workspace, `fs/read_text_file`) stays global. Blocked set: `~/.ssh`, `~/.gnupg`, and each profile’s credential file (`auth.json`, kimi creds, `~/.claude.json` secrets, Codex auth). Writes still require a trusted workspace.

`run_grok` MCP/plugin argv goes away for the hub. Remaining per-CLI argv (models, login, inspect-like session helpers) stay on `run_admin(agentId, args)` with per-adapter allowlists. `npx` adapters: allowlist the exact pinned package name.

## Concurrency and lifecycle

- Warm the **selected** agent on app start (today’s Grok warmup), not all four.
- Opening a session for a cold agent starts that child; previous children stay alive until idle timeout (default 30 min) or explicit “stop agent”.
- `agent-exit` is per `agentId`. Only sessions of that agent go disconnected.
- Split: if both panes share an agent, one child (today). If they differ, two children; permission queue keys by `SessionRef`.

## Security

- No new network from Rust except the child’s own.
- Pinned adapter npm versions; checksum optional in a later wave.
- Same attachment cap and paste sandbox, rooted at desktop home not `~/.grok`.
- Config writes stay lock + size cap, per that agent’s config path.
- Do not log tokens, cookies, or `auth.json` contents.

## Testing bar (Grok 1:1 plus adapters)

- Existing Grok tests stay green: `list_sessions` parse, `rpc_payload_allowed` **for the Grok child** still allows `_x.ai/*` and still rejects unknown methods; `session/set_mode` is allowed only after a child advertised it (update the old global deny test).
- New: `SessionRef` keying, event tagging, allowlist-from-capabilities, argv allowlists per adapter.
- AgentsStore: create skill under `~/.agents/skills`, sync symlink, mcp.json merge into a fixture Claude/Codex/Grok config without touching real homes (temp dirs).
- Usage: `authKind === "api"` ⇒ `usage_quota` is null and no HTTP; brand switcher filters turns.
- Adapter unit tests: parse fixtures from Phase 0 dumps (initialize JSON, session list, inspect-like blobs). No live network in CI.
- Manual: Grok new/resume/permission/hub/settings unchanged; then Kimi/Claude/Codex the same script.

## Implementation waves

Wave 0 does not ship UI. Waves 1–2 must not regress Grok chat.

0. **Probe (2–3 days).** Spawn each ACP; record initialize, prompt, permission, session/list, `authKind` files/env, subscription quota endpoints (if any), skill scan paths (`~/.agents/skills` vs native), MCP live-file schemas. Output: `docs/superpowers/specs/acp-probe/{grok,kimi,claude,codex}.md`. Freeze npm pins. No plugin/imagine probes.
1. **Host + SessionRef + Grok extract (1–1.5 weeks).** Process pool of one, tagged events, `workbench.json` migration. Grok chat/session/settings unchanged. Regression: full current suite except plugin hub tests rewritten or dropped.
2. **AgentsStore (1–1.5 weeks).** `~/.agents` skills + `mcp.json` + `sync.json`; hub tabs skills/mcp/marketplace; symlink/merge sync; import existing native skills/MCP; delete plugin tab.
3. **Kimi ACP + sessions (1–1.5 weeks).** Native `kimi acp`, catalog, doctor/`authKind`, token recorder. Skills/MCP already global.
4. **Claude ACP + sessions (1–1.5 weeks).** Pinned adapter, authenticate, `authKind` (OAuth vs API key). Confirm subscription usage endpoint before wiring the ring.
5. **Codex ACP + sessions (1–1.5 weeks).** Pin `@agentclientprotocol/codex-acp`. ChatGPT vs API key for ring.
6. **Workbench chrome + usage (3–5 days).** Agent chip, sidebar pill, doctor list, usage brand switcher, subscription-only rings.

Total after probe: about **6–8 weeks** for one engineer. Imagine/video and plugins are not in this total.

## Phase 0 probe script (required before Wave 1 code)

For each agent, record:

1. Binary resolution and version
2. Exact spawn argv that waits on stdin with no banner
3. `initialize` request/response
4. `authenticate` if required
5. `session/new` → `session/prompt` → `session/update` kinds
6. One `session/request_permission` if tools run
7. `session/list` / `session/load` / `session/resume`
8. `configOptions` ids (model, mode, effort)
9. `authKind` evidence (which file/env means subscription vs API)
10. Subscription quota command or API, if any; prove API-key mode makes no such call
11. Whether the CLI already scans `~/.agents/skills`
12. Native MCP file path and schema (for sync writers)

If a step fails, the method is `unsupported` with that log cited. Do not invent flags.

## Non-goals (this round)

- Plugins, Grok/Claude plugin marketplace
- Imagine/video for anyone except leaving Grok as-is
- Bundling the four CLIs
- One shared session id space
- In-app PTY or browser
- Changing review-rail IA
- Auto-updating npx adapters
- Depending on cc-switch’s SQLite database
- Polling usage rings for API-key accounts

## Open probe-only questions

- Exact `authKind` files for each CLI when both OAuth and a key exist (locked rule: key ⇒ api)
- Claude/Codex subscription usage endpoints
- Whether Grok/Kimi already scan `~/.agents/skills` so those sync targets can be no-ops
- Codex: which adapter matches ChatGPT login without an API key
- Whether to advertise `terminal` / subagent bits for Claude tool cards

## Success

A user can pick Grok, Kimi, Claude, or Codex and run new/resume/stream/permissions/model/mode/fork/rewind/worktree/split. Skills and MCP are edited once in `~/.agents` and appear in every synced CLI. Marketplace installs skills only. Usage tokens are recorded per CLI and switched with one brand control. Subscription CLIs show a quota ring; API-key CLIs do not. Grok chat matches today’s app. Imagine/video is still the old Grok UI, untouched.
