# ACP Phase 0 probe notes

Recorded 2026-08-31 for the desktop spawn table. Live `initialize` dumps were not captured this round (no child process handshake in CI). Packaged builds use the npm registry versions below, not `@latest`.

## Spawn argv

| Agent | Command | Args | Pin source |
|---|---|---|---|
| grok | `{GROK_HOME}/bin/grok` | `agent stdio` | resolve_grok |
| kimi | `kimi` | `acp` | CLI |
| claude | `npx` | `-y @agentclientprotocol/claude-agent-acp@0.70.0` | npm 2026-08-31 |
| codex | `npx` | `-y @agentclientprotocol/codex-acp@1.7.0` | npm 2026-08-31 |

## Default initialize (spec, not live dump)

```json
{
  "protocolVersion": 1,
  "clientCapabilities": {
    "fs": { "readTextFile": true, "writeTextFile": true },
    "terminal": false
  }
}
```

Per-agent files record the same argv and this initialize blob until a live probe replaces them.
