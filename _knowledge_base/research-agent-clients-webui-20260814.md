# Agent 客户端与 WebUI 开源方案 调研笔记

调研日期：2026-08-14
调研目标：为 Grok Build 做 macOS 桌面客户端，摸清同类 Agent CLI/WebUI/桌面端开源方案、协议与可复用架构。

## 关键问题
1. 各家 coding agent（Claude Code / Codex / Gemini CLI / Kimi CLI / OpenCode / Goose 等）现有哪些开源客户端、WebUI、桌面壳？
2. Kimi CLI 的 WebUI 具体是什么、怎么接 CLI、协议与实现栈是什么？
3. 桌面端常见技术栈（SwiftUI / Tauri / Electron / 终端嵌入）各自适合什么？
4. Grok Build 已有哪些可接入口（ACP / headless / agent serve / leader），桌面端应包一层还是重写？
5. 哪些方案最适合作为 Grok Build macOS 客户端的参考或直接复用？

## 本地已核实（Grok Build 1.0.3）

- Grok Build 官方形态是 TUI，不是桌面 App。
- 三种接入：交互 TUI、`grok -p` headless、`grok agent` ACP。
- `grok agent` 子命令：`stdio` / `headless`（WebSocket relay）/ `serve`（本机 WebSocket）/ `leader`。
- ACP 覆盖 session、prompt 流、tool call、thought、权限提示；另有 `x.ai/*` 扩展（fs/git/search/terminal/session/auth）。
- 官方兼容客户端：Zed、Neovim（CodeCompanion/avante）、Emacs agent-shell、marimo；JetBrains 标注 Coming soon。
- SDK：TS `@agentclientprotocol/sdk`、Rust `agent-client-protocol`、Python、Go、Kotlin。
- Dashboard 仍是 TUI（`grok dashboard`），不是 Web。
- 本机已有相关参考仓：`~/project_development/paperclip_main`；本机 skill 里有 Hermes Desktop 插件体系（Nous Hermes 桌面端）。

## 发现

### 阶段摘要 (第1轮)

行业已分成两条路：厂商自己做官方桌面（Claude Desktop Code 页、Codex App、OpenCode Desktop、Goose Desktop、Hermes Desktop），以及社区用 ACP / 自有协议给 CLI 套壳（Kimi WebUI、gemini-cli-desktop、ACP UI、Happy）。Grok Build 已原生讲 ACP，且自带 `grok agent serve` WebSocket，不必重写 agent。

### Kimi CLI / Kimi Code WebUI

两代产品并存，不要混。

1. **旧代 `MoonshotAI/kimi-cli`（Python，Apache-2.0）**
   - 官方 WebUI：`kimi web` 或 TUI 里 `/web`。
   - 默认 `http://127.0.0.1:5494`，端口占用则试 5494–5503。
   - 栈：FastAPI + WebSocket + React/TS/Vite。
   - 协议：WebUI 通过 WebSocket 接 CLI 的 **Wire mode**；Soul（agent 核）不关心 UI，Shell UI 直接吃 Wire，ACP 客户端再把 Wire 转成 ACP。
   - 前端能力：会话列表/搜索/fork/归档、@ 文件、slash、权限 1–4 快捷键、AskUserQuestion、子代理来源标注、Git 变更条、context 用量、plan mode。
   - 安全：loopback 默认；`--network` + `--auth-token` + `--allowed-origins` + `--lan-only`/`--public`；`--restrict-sensitive-apis`。
   - 已知坑：TUI 内 `/web` 切进程会挂死；独立 `kimi web` 更稳。
   - 源码目录：`web/`，`make build-web` 打进 Python 包。
   - 文档仍在：https://moonshotai.github.io/kimi-cli/en/reference/kimi-web.html

2. **新代 `MoonshotAI/kimi-code`（TypeScript，MIT，2026-06 发布，接替 kimi-cli）**
   - 用户明确要求把 `/web` 加回来：https://github.com/MoonshotAI/kimi-code/issues/554
   - 官方文档已有 **Local Server and API**：`kimi web` 同时挂 Web UI、`/api/v1` REST、`/api/v1/ws`。
   - 默认 bind `127.0.0.1:58627`，token 存 `~/.kimi-code/server.token`（0600），URL `#token=` 片段登录。
   - WS 浏览器不能设 header，用 subprotocol `kimi-code.bearer.<token>`。
   - 事件：`turn.started` → `assistant.delta` → `tool.call.started`/`tool.result` → `turn.ended`。
   - 自描述：`/openapi.json` + `/asyncapi.json`。接口标 experimental。
   - 文档：https://www.kimi.com/code/docs/en/kimi-code-cli/guides/server.html

对 Grok 的可抄点：CLI 当唯一引擎；本机 loopback + bearer + `#token=`；REST 建会话 + WS 流事件；权限/Ask 做成一等 UI。不要抄「从 TUI 进程内切 Web」那条路径。

### 官方厂商桌面端（闭源或半开源）

| 产品 | 形态 | 开源？ | 对 Grok 的含义 |
|------|------|--------|----------------|
| Claude Desktop Code 页 | 官方桌面，Chat/Cowork/Code 三页 | 否 | 产品标杆：并行 session、diff 审阅、内置 browser/terminal/editor、权限档位、side question、同 CLI 配置 |
| Codex App（2026-02 macOS，03 Windows；后并入 ChatGPT Desktop） | 多 agent 并行、diff、sandbox | 否 | 标杆：多 agent 指挥台，不是单聊窗 |
| OpenCode Desktop | 官方桌面 + TUI + IDE + ACP | 是（MIT，anomalyco/opencode） | 同一 backend 多前端。桌面曾 Tauri，2026-04 改 Electron |
| Goose Desktop | 官方原生桌面 + CLI + API + ACP server | 是（Apache-2.0，aaif-goose/goose） | Linux Foundation AAIF；Rust；桌面是一等公民 |
| Hermes Desktop | Electron `apps/desktop/`，接同一 gateway | 是（MIT，NousResearch/hermes-agent） | 同一 agent / 同一 session / 插件体系。本机已有 skill |

OpenCode 官方称 195k GitHub stars（需再核仓库当前数）。Goose 约 45k–48k。Hermes 增长很快（二手称约 180k，待核）。

### 社区给 CLI 套壳（最接近「给 Grok 做桌面」）

- **Piebald gemini-cli-desktop**（MIT，482 stars）：Tauri + React + Rocket。协议写明 ACP + WebSocket。功能：tool 确认、thought、diff、历史搜索、@ 文件、MCP。同一套前端同时出桌面和 web（1858）。这是最直接的架构对照。
- **formulahendry/acp-ui**（MIT，约 435 stars，Tauri）：通用 ACP 客户端，stdio 或 `ws://`/`wss://`。已预置 Claude/Codex/Gemini/OpenCode/Hermes 等，**没有 Grok**。Web 版 https://acp-ui.github.io/。可立刻拿来接 `grok agent stdio` 或 `grok agent serve` 做可用性验证。
- **slopus/happy**（MIT）：Claude Code / Codex 的远程遥控（iOS/Android/Web + CLI sidecar），端到端加密。远程控制参考，不是本机桌面。
- **Jockey**（Tauri+Rust+SolidJS）：多 agent 编排，Claude/Gemini/Codex via ACP。
- **Gold Band**：local-first ACP 桌面。
- **DeepChat / AionUi / Cherry Studio**：偏多模型聊天桌面，不是 coding-agent 客户端。Cherry 是国内最流行 Electron 多模型客户端（AGPL-3.0 / 企业版部分闭源），不要当 coding agent 参考。

### ACP 生态（2026 已是标准）

- 规范：https://agentclientprotocol.com
- 本地 stdio 或远程 HTTP/WS。
- 官方 registry 已含 Claude Code、Codex CLI、Copilot CLI、OpenCode、Gemini CLI 等。
- 客户端极多：Zed、JetBrains、Neovim、VS Code 扩展、Obsidian、ACP UI、手机端 Happy/Agmente。
- 桥：stdio→WS（`@rebornix/stdio-to-ws`）、ACP→AG-UI。
- Grok 已实现 ACP + 自有 `x.ai/*` 扩展。桌面端应做 **ACP client**，并按需吃 `x.ai/*`（fs/git/terminal/session）。

### 阶段摘要 (第2轮)

给 Grok 做 macOS 客户端，正确分层是：

```
macOS UI  --ACP(stdio 或 WS)-->  grok agent stdio/serve/leader
```

不要重写工具、权限、session、MCP。Kimi 的 `kimi web` 是「CLI 自带 Web 服务器」；Grok 已有更标准的 `grok agent serve`，差的是 UI。

### 已有 Grok 社区桌面端（2026-08 核实）

官方没有桌面 App。社区已经在做同一件事：

| 项目 | 栈 | 协议 | 许可 | Stars | 备注 |
|------|----|------|------|-------|------|
| [rimusz/grok-build-desktop](https://github.com/rimusz/grok-build-desktop) | SwiftUI 原生 | `grok agent stdio` | Apache-2.0 | ~22 | 最接近「macOS 官方壳」。会话/权限/diff/dashboard/worktree/模型设置。要求 macOS 26 Tahoe。有公证发布。 |
| [phuryn/grok-build-vscode](https://github.com/phuryn/grok-build-vscode) | Electron + VS Code 扩展 | `grok agent stdio` | FSL-1.1-MIT | ~140 | 功能最全：diff、Imagine、语音、远程 AFK Pilot。商业竞品受限。未公证。 |
| [formulahendry/acp-ui](https://github.com/formulahendry/acp-ui) | Tauri | 通用 ACP stdio/WS | MIT | ~435 | 可立刻加 `grok agent stdio` 配置验证，非 Grok 专属。 |
| RapidAI/grok-build-desktop | Tauri | ACP | Apache-2.0 | 4 | 体量小，仅作参考。 |

Grok 已在 ACP Registry / Zed 可装：`npx @xai-official/grok@1.0.3 agent stdio`。

### Goose 的教训

Goose 早期 Electron 桌面走自定义 REST+SSE（`goosed`），CLI 走进程内，两套接线。2026-04 起统一到 ACP，桌面再迁 Tauri。Grok 已经在 ACP，不要重走 `goosed` 弯路。

## 调研结论

### 关键事实
1. Grok Build 1.0.3 已是完整 ACP agent：`stdio` / `serve`（本机 WS）/ `leader` / relay。桌面端应是 client，不是第二套 harness。
2. Kimi 的 WebUI 是「同一 CLI 核 + FastAPI/WS + React」。新代 `kimi web` 还挂 REST `/api/v1` 与 AsyncAPI。TUI 内 `/web` 切进程不稳。
3. 2026 行业共识：TUI / 桌面 / IDE 共用一个 agent。OpenCode、Hermes、Goose、Codex App、Claude Desktop Code 页都是这条路。
4. 聊天壳（Cherry / Open WebUI / Lobe / Chatbox / Jan）不是 coding-agent 客户端，只可偷设置页和会话列表。
5. 给 Grok 做 macOS 客户端，社区已有可运行的 SwiftUI（rimusz）和 Electron（phuryn）。先装再用，再决定自建还是分叉。

### 待确认问题
- rimusz 要求 macOS 26 Tahoe，本机系统是否满足。
- OpenCode Desktop 当前发行是 Electron 还是仍有 Tauri 包。
- 自建若要吃 `x.ai/*`（fs/git/terminal/session），通用 ACP UI 覆盖到哪一层。
- phuryn 的 FSL 是否挡住个人/对外分发意图。

## 来源列表

| 来源 | URL | 日期 | 可信度 |
|------|-----|------|--------|
| Grok 本地文档 1.0.3 | ~/.grok/docs/user-guide/15-agent-mode.md 等 | 本机 | 高 |
| Kimi CLI WebUI 文档 | https://moonshotai.github.io/kimi-cli/en/reference/kimi-web.html | 2026 | 高 |
| Kimi Code Local Server | https://www.kimi.com/code/docs/en/kimi-code-cli/guides/server.html | 2026 | 高 |
| kimi-code #554 要回 WebUI | https://github.com/MoonshotAI/kimi-code/issues/554 | 2026-06 | 高 |
| kimi-cli /web hang | https://github.com/MoonshotAI/kimi-cli/discussions/981 | 2026-02 | 高 |
| OpenCode 官网 | https://opencode.ai/ | 2026-08 | 高 |
| OpenCode Desktop README | https://github.com/anomalyco/opencode/blob/dev/packages/desktop/README.md | 2026 | 高 |
| OpenCode 弃 Tauri 改 Electron | https://www.reddit.com/r/opencodeCLI/comments/1sok2dy/ | 2026-04 | 中 |
| ACP clients | https://agentclientprotocol.com/get-started/clients | 2026 | 高 |
| Claude Desktop Code | https://code.claude.com/docs/en/desktop | 2026 | 高 |
| Codex App 发布 | https://openai.com/index/introducing-the-codex-app/ | 2026-02 | 高 |
| Goose | https://github.com/aaif-goose/goose | 2026 | 高 |
| Hermes Desktop | https://hermes-agent.nousresearch.com/ | 2026-08 | 高 |
| gemini-cli-desktop | https://github.com/Piebald-AI/gemini-cli-desktop | 2026 | 高 |
| ACP UI | https://github.com/formulahendry/acp-ui | 2026 | 高 |
| Happy | https://github.com/slopus/happy | 2026 | 高 |
| Cherry Studio | https://github.com/CherryHQ/cherry-studio | 2026 | 高 |
