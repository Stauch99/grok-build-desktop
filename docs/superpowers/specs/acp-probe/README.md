# ACP Phase 0 probe notes

Live `initialize` captured 2026-08-31 on this machine (12s handshake timeout, probe children only). Packaged builds still use the npm pins below, not `@latest`.

Request sent (one line JSON-RPC):

```json
{"jsonrpc":"2.0","id":1,"method":"initialize","params":{"protocolVersion":1,"clientInfo":{"name":"grok-build-webui","title":"Grok Build","version":"0.4.0"},"clientCapabilities":{"fs":{"readTextFile":true,"writeTextFile":true},"terminal":false}}}
```

## Spawn argv (unchanged)

| Agent | Command | Args | Pin source | Live handshake |
|---|---|---|---|---|
| grok | `{GROK_HOME}/bin/grok` | `agent stdio` | resolve_grok | initialize OK (~1.7s) |
| kimi | `kimi` | `acp` | CLI | initialize OK (~12s idle after result) |
| claude | `npx` | `-y @agentclientprotocol/claude-agent-acp@0.70.0` | npm 2026-08-31 (latest) | hang 12s, **zero stdout** |
| codex | `npx` | `-y @agentclientprotocol/codex-acp@1.7.0` | npm 2026-08-31 (latest) | hang 12s, **zero stdout** |

Pins were already latest on the registry (`0.70.0` / `1.7.0`). No pin or argv change: no portable live command beat the table above.

## `sessionCapabilities.list` (Task 3.2)

| Agent | Advertised? | Notes |
|---|---|---|
| grok | **yes** (`{}`) | via app spawn |
| kimi | **yes** (`{}`) | via app spawn |
| claude | **unknown** | no live initialize |
| codex | **yes** (`{}`) | only via `CODEX_PATH` + cached `node` bin; app `npx` spawn never reached initialize |

Recommendation: implement `session/list` now, gated on the initialize advertisement. Grok and Kimi work on the current spawn table.

## Ready / spawn

`start_agent` still returns spawn-ok only. Frontend `ensureAgent` sets `ready` only after `initialize` succeeds. Claude/Codex stay not-ready when the npx child hangs. No Rust change this round (spawn already surfaces `无法解析 … 启动参数` / `启动 … agent 失败`; hanging npx is an initialize timeout, not a spawn argv miss).
