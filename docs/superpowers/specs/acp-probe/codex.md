# codex ACP probe

Captured 2026-08-31. App spawn: `npx -y @agentclientprotocol/codex-acp@1.7.0` (npm latest that day). **App argv does not handshake in 12s.**

- Session disk: `~/.codex/sessions/<folder>` (name = id; no vendor JSON parse)
- Resume: `session/load` or `session/resume` — advertised on the alternate spawn below, not via app `npx`
- Native `codex` on PATH (`/opt/homebrew/bin/codex`, 0.144.6): **no `acp` subcommand** (`mcp-server`, `app-server` exist; those are not ACP)
- Pin left at `@1.7.0` (registry latest). No argv change (cache-path `node` is not portable; `npx --offline` failed `ENOTCACHED`)

## stderr first screen (app `npx`)

`--help` and initialize both hung 12s. stdout **0 bytes**. stderr (146 bytes), entire first screen:

```
npm warn Unknown env config "devdir". This will stop working in the next major version of npm. See `npm help npmrc` for supported config options.
```

Package CLI (from source): `--version`, `login`, `cli`; otherwise starts the ACP server. `--help` is not handled.

## Alternate: cached bin without `CODEX_PATH` (live error)

`node ~/.npm/_npx/c8b015f66c7988d7/node_modules/@agentclientprotocol/codex-acp/dist/index.js`

stderr empty. stdout (JSON-RPC error, code 1001): bundled `@openai/codex` missing optional `@openai/codex-darwin-arm64`.

```json
{
  "jsonrpc": "2.0",
  "id": 1,
  "error": {
    "code": 1001,
    "message": "Codex process has exited with code 1:\n... Missing optional dependency @openai/codex-darwin-arm64. Reinstall Codex: npm install -g @openai/codex@latest ..."
  }
}
```

## Alternate: `CODEX_PATH` + cached bin (live initialize)

`CODEX_PATH=/opt/homebrew/bin/codex` + the same `node …/dist/index.js`. README documents `CODEX_PATH` for a local Codex binary.

`loadSession: true`. `sessionCapabilities.list` advertised as `{}`. `authMethods`: `api-key` only this run (`NO_BROWSER=1` hid ChatGPT login).

```json
{
  "protocolVersion": 1,
  "agentInfo": {
    "name": "@agentclientprotocol/codex-acp",
    "title": "Codex",
    "version": "1.7.0"
  },
  "agentCapabilities": {
    "auth": { "logout": {} },
    "providers": {},
    "loadSession": true,
    "promptCapabilities": { "embeddedContext": true, "image": true },
    "sessionCapabilities": {
      "resume": {},
      "list": {},
      "close": {},
      "delete": {},
      "additionalDirectories": {},
      "subagents": {}
    },
    "mcpCapabilities": { "acp": false, "http": true, "sse": false }
  },
  "authMethods": [
    {
      "id": "api-key",
      "name": "API Key",
      "description": "Use an API key to authenticate",
      "_meta": { "api-key": { "provider": "openai" } }
    }
  ],
  "_meta": {
    "steering": { "supported": true },
    "goal": {
      "version": 1,
      "controlMethod": "_session/goal",
      "actions": ["set", "pause", "resume", "clear"]
    },
    "jetbrains": {
      "air": {
        "version": 1,
        "capabilities": ["sessionFailure", "agentFileChangeReport", "nativeSubagentSessions"]
      }
    }
  }
}
```

This is **not** the app spawn. Setting `CODEX_PATH` in Rust would help only after `npx` actually starts the JS (it did not within 12s). Isolation: docs only.

## Ready

App `npx` spawn does not handshake in 12s. Leave `ready` false until initialize succeeds.
