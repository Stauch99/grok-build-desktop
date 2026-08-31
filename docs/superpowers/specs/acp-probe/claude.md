# claude ACP probe

Captured 2026-08-31. App spawn: `npx -y @agentclientprotocol/claude-agent-acp@0.70.0` (npm latest that day). **No live initialize.**

- Session disk: `~/.claude/projects/<folder>` (name = id; no vendor JSON parse)
- Resume: `session/load` or `session/resume` on the claude child — not verified live
- Native `claude` on PATH (`~/.local/bin/claude`, 2.1.231): **no `acp` / `agent` / `--acp` subcommand**
- Pin left at `@0.70.0` (registry latest). No argv change.

## stderr first screen (npx `--help` and initialize)

Both hung 12s. stdout **0 bytes**. stderr (146 bytes), entire first screen:

```
npm warn Unknown env config "devdir". This will stop working in the next major version of npm. See `npm help npmrc` for supported config options.
```

`--help` is not implemented by the package (`src/index.ts` handles `--cli` then `--version`/`-v`, else starts the ACP server). The process never printed help or a JSON-RPC result before timeout.

## Package / PATH notes (not a live handshake)

- README spawn: `npx -y @agentclientprotocol/claude-agent-acp` (stdio ACP via Claude Agent SDK).
- bin: `claude-agent-acp` → `dist/index.js`. engines: `node >= 22`.
- Adapter resolves the Claude native binary via `CLAUDE_CODE_EXECUTABLE` or `@anthropic-ai/claude-agent-sdk-<platform>-<arch>` (optional dep). A PATH `claude` is **not** sufficient by itself.
- `npm pack` of `0.70.0` succeeded. Two `npm install` attempts of the full dep tree failed with `ECONNRESET`, so the bin was not run directly.
- Published `dist/acp-agent.js` *would* return `loadSession: true` and `sessionCapabilities.list: {}` — **source, not a live dump**. Do not treat as handshake.

## Ready

App `npx` spawn does not handshake in 12s. Leave `ready` false until initialize succeeds. Do not invent ready=true on spawn.
