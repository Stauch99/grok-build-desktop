# grok ACP probe

Captured 2026-08-31. Spawn: `/Users/foxie/.grok/bin/grok agent stdio` (v1.0.5).

- RPC extras: `_x.ai/*` on this child only (`fs_notify`, `hooks`, `capabilities.toolOverrides`, plus notification `_x.ai/mcp/servers_updated`)
- Session disk: `~/.grok/sessions/<id>/` including `updates.jsonl`
- `--help`: `grok agent stdio` is a real subcommand (stdio ACP server)
- stderr first screen: **empty** (0 bytes)
- elapsed: 1.71s (result then SIGTERM of the probe PID)

## Initialize (live)

`loadSession: true`. `sessionCapabilities.list` advertised as `{}`.

```json
{
  "protocolVersion": 1,
  "agentCapabilities": {
    "loadSession": true,
    "promptCapabilities": { "image": false, "audio": false, "embeddedContext": true },
    "mcpCapabilities": { "http": true, "sse": true },
    "sessionCapabilities": { "list": {}, "resume": {}, "close": {} },
    "auth": {},
    "_meta": {
      "x.ai/fs_notify": true,
      "x.ai/hooks": {
        "blockingEvents": ["pre_tool_use", "stop", "subagent_stop"],
        "decisions": ["deny", "block"],
        "stopSignals": ["continue", "stopReason", "additionalContext"]
      },
      "x.ai/capabilities": {
        "toolOverrides": {
          "x_keyword_search": true,
          "x_semantic_search": true,
          "x_user_search": false,
          "x_thread_fetch": false
        }
      }
    }
  },
  "authMethods": [
    { "id": "cached_token", "name": "cached_token", "description": "Cached token from ~/.grok/auth.json" },
    { "id": "grok.com", "name": "Grok", "description": "Sign in with Grok" }
  ],
  "_meta": {
    "grokShell": true,
    "defaultAuthMethodId": "cached_token",
    "x.ai/mcp/sdk": true,
    "x.ai/pluginDirs": true,
    "agentVersion": "1.0.5"
  }
}
```

Trimmed from live `_meta`: `currentWorkingDirectory`, `hostname`, `agentId` / `agentInstanceId`, `modelState` (current `grok-4.6`, also `grok-4.5`), `availableCommands`, `mcpServers: []`. A follow-up notification `_x.ai/mcp/servers_updated` listed local MCP URLs and was omitted.
