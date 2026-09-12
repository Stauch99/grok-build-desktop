# kimi ACP probe

Captured 2026-08-31. Spawn: `kimi acp` (Kimi Code CLI 0.37.2).

- Session disk: `~/.kimi-code/sessions/<folder>` (name = id; no vendor JSON parse)
- Resume: `session/load` or `session/resume` on the kimi child
- `--help`: `kimi acp` is a real stdio ACP server. Flags: `--login` (device-code, then exit), `-h`
- stderr first screen: **empty** (0 bytes)
- elapsed: 12.08s timeout after the result (stdio server stayed up; probe PID SIGTERM)

## Initialize (live)

`loadSession: true`. `authMethods: login`. `sessionCapabilities.list` advertised as `{}`.

```json
{
  "protocolVersion": 1,
  "agentCapabilities": {
    "loadSession": true,
    "promptCapabilities": { "image": true, "audio": false, "embeddedContext": true },
    "sessionCapabilities": {
      "list": {},
      "resume": {},
      "close": {},
      "delete": {},
      "fork": {},
      "additionalDirectories": {}
    },
    "mcpCapabilities": { "http": true, "sse": true },
    "auth": { "logout": {} }
  },
  "authMethods": [
    {
      "id": "login",
      "type": "terminal",
      "name": "Login with Kimi account",
      "description": "Open the device-code login flow in a terminal.",
      "args": ["--login"],
      "env": {},
      "_meta": {
        "terminal-auth": {
          "type": "terminal",
          "label": "Login with Kimi account",
          "command": "kimi",
          "args": ["login"],
          "env": {}
        }
      }
    }
  ],
  "agentInfo": { "name": "Kimi Code CLI", "version": "0.37.2" }
}
```
