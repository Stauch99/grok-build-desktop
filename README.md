# Grok Build Desktop

[![CI](https://github.com/Stauch99/grok-build-desktop/actions/workflows/ci.yml/badge.svg)](https://github.com/Stauch99/grok-build-desktop/actions/workflows/ci.yml)
[![License: MIT](https://img.shields.io/badge/License-MIT-yellow.svg)](LICENSE)
[![Tauri](https://img.shields.io/badge/Tauri-2-24c8db?logo=tauri&logoColor=white)](https://tauri.app/)
[![ACP](https://img.shields.io/badge/Protocol-ACP-111111)](https://agentclientprotocol.com/)

**A native desktop workbench for ACP coding agents.** Chat, sessions, permissions, Git, and file review live here. The agent runtime stays in the CLI.

[中文说明](#中文) · [Handoff](docs/HANDOFF.md) · [Contributing](CONTRIBUTING.md)

![Main window](docs/ui-audit/2026-08-30/01-main.png)

This is a **community** desktop client. It is not an official xAI, Anthropic, OpenAI, or Moonshot product.

## Why this exists

Coding CLIs already know how to plan, edit, and run tools. What they lack is a calm place to *watch* that work: sessions beside projects, a permission card when the agent wants the network, a diff you can rewind, a Git pane that does not steal the chat.

Grok Build Desktop is that place. It speaks [Agent Client Protocol](https://agentclientprotocol.com/) over stdio. It does not reimplement the model loop.

| Agent | How it starts |
| --- | --- |
| **Grok** | `grok agent stdio` |
| **Kimi** | `kimi acp` |
| **Claude** | `npx -y @agentclientprotocol/claude-agent-acp@0.70.0` |
| **Codex** | `npx -y @agentclientprotocol/codex-acp@1.7.0` |

## What you get

- **Projects and sessions** — pin, archive, split panes, resume from each CLI’s own history
- **Live turn** — streaming text, thoughts, plans, classified tool calls, permission cards
- **Workbench chrome** — explorer, preview (Markdown + Mermaid), Git status / history / commit, review rail
- **One Skills / MCP plane** — canonical store is `~/.agents`, then synced into each enabled CLI
- **Honest empty states** — if a CLI has no analog (hooks, personas, imagine), the UI says so instead of faking it

What it is **not**: a full IDE, a browser web UI, or a replacement for `git`, `lldb`, or your `$EDITOR`.

## Requirements

- macOS 13+ is the development and verification environment. Tauri also bundles Windows (NSIS/MSI) and Linux (deb/AppImage).
- Node 22+ and a current Rust toolchain (for `tauri dev` / `tauri build`)
- At least one ACP CLI installed and logged in (Grok, Kimi, Claude Code, or Codex)

## Quick start

```bash
git clone https://github.com/Stauch99/grok-build-desktop.git
cd grok-build-desktop
npm install
npm test
npm run tauri dev
```

Frontend-only typecheck and tests (no Rust):

```bash
npm run typecheck
npm test
```

Production bundle:

```bash
npm run tauri build
```

macOS artifacts land in `src-tauri/target/release/bundle/macos/` and `dmg/`.

## Architecture in one picture

```
React chrome  ──AgentPort──►  Tauri AgentHost (one ACP child per agentId)
                                   │
                    GrokAdapter / KimiAdapter / ClaudeAdapter / CodexAdapter
                                   │
                              CLI stdio (ACP)
```

UI talks to sessions only through `AgentPort`. Skills and MCP go through `AgentsStore` (`~/.agents`), not per-CLI copies of the hub. See [docs/HANDOFF.md](docs/HANDOFF.md) if you are forking or adding a fifth agent.

## Status and boundaries

- Desktop-only. No browser mode, no remote control plane.
- “Rewind to here” restores files that have a **known session diff**. It is not a full workspace rollback.
- “Open in terminal” currently launches macOS Terminal.app.
- Imagine / video stays on the existing Grok path. Other providers are out of scope for this wave.
- No in-app auto-update. Install new builds yourself.

## Docs

| Doc | For |
| --- | --- |
| [docs/HANDOFF.md](docs/HANDOFF.md) | Forkers and secondary development |
| [CONTRIBUTING.md](CONTRIBUTING.md) | Issues, PRs, tests |
| [SECURITY.md](SECURITY.md) | Vulnerability reports |
| [docs/superpowers/specs/2026-08-30-multi-agent-acp-workbench-design.md](docs/superpowers/specs/2026-08-30-multi-agent-acp-workbench-design.md) | Locked product decisions |

## License

[MIT](LICENSE) © 2026 Stauch

---

## 中文

Grok Build Desktop 是面向 ACP coding agent 的**原生桌面工作台**：项目与会话、许可、Git、文件审阅在这里完成；模型调用和工具执行仍由各家 CLI 负责。

当前对接 Grok（`grok agent stdio`）、Kimi（`kimi acp`）、Claude 与 Codex（固定版本的官方 ACP 适配包）。技能与 MCP 的源目录是 `~/.agents`，再同步到各 CLI，而不是四套平行后台。

这是社区客户端，不是 xAI / Anthropic / OpenAI / Moonshot 官方应用。二次开发请读 [docs/HANDOFF.md](docs/HANDOFF.md)。
