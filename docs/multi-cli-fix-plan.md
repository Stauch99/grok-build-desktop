# Multi-CLI 可用性修复方案

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans. Steps use checkbox (`- [ ]`) syntax.

**Goal:** 让当前工作区能真正当四个 ACP 后端的工作台用：壳子能启动，点某条会话只打到该 CLI 的 child，侧栏不再把工作区文件夹当成聊天。

**Architecture:** 规格已定（`docs/superpowers/specs/2026-08-30-multi-agent-acp-workbench-design.md`）。本轮不重做 AgentsStore / hub 页，只修验证里挡住「好用」的断裂：脏树对齐、`SessionRef` 路由、诚实的会话目录、Claude/Codex 活探测。零件（process pool、MCP 同步、usage ring）已经落地，不要重写。

**Tech Stack:** 现有 Tauri 2 + React + Vitest + `cargo test --lib`。不新增 CLI、不引入 cc-switch DB。

## Global Constraints

- `AgentId` 仍是封闭枚举：`grok | kimi | claude | codex`。
- 脏工作区禁止 `git add -A`。`src-tauri/src/lib.rs`、`src/App.tsx`、`src/hooks/useAppModel.ts` 必须 isolation dance（stash / checkout HEAD / 只提交本任务 hunk / 还原脏树 / 再打回 hunk）。
- 不要发明 vendor JSONL。探测没找到 transcript 就空回放，靠 `session/load`。
- 不要把 Claude `~/.claude/projects` 的工作区目录当成 session id。
- 打开会话：`session/load` 或 `session/resume` 只能打到 **该行 `agentId` 的 child**。Never pass a Claude id to Grok。
- Imagine / video / plugins / 改 bundle id：本轮不做。
- 分支保持 `feat/multi-agent-workbench`。

---

## 规格对照（审查结论）

验证日期 2026-08-31。对照规格 §Session model / §ACP host / §Identity，不是对照「单测绿」。

| 规格要求 | 当前事实 | 本方案 |
|---|---|---|
| 壳子可运行 | 脏 `App.tsx` 仍拆 `paneTree` / `beginPaneDrag` / `skillCommands`，`useAppModel` 返回值没有这些字段。`tsc` 红，`ui-chrome` 1 败 | Wave 0 |
| Resume 打到 **that** agent | `resumeSession` → `ensureAgent()` → `selectedAgentId`。点 Kimi 行时 chip 是 Grok，会把 Kimi id 交给 Grok | Wave 1 |
| 事件按 pane `SessionRef` 丢弃 | `shouldDropAcpEvent` 在，但 pane 没有绑定 `agentId`，等于没绑 | Wave 1 |
| `list_sessions` 诚实 | Grok 走 `summary.json`；Kimi/Claude/Codex 扫一层文件夹。本机 Claude **46 个 projects 目录**（`-Users-foxie-...`）会灌进独立对话，且 `cwd: ""` | Wave 2 |
| Phase 0 写出每家 initialize | 文档是默认 blob。活探测：Grok / Kimi 通；Claude / Codex `@0.70.0` / `@1.7.0` 等 25s **stdout 空** | Wave 3 |
| `~/.acp-workbench` 首启 | `workbench.json` 在，但无 `lastAgent`、`inboxCwd` 空、`agents.toml` 未写、`Agent Chats` 未建——因为壳子没成功 `load_webui_state` | Wave 0 之后自然发生；Wave 4 补测试 |
| Skills/MCP / hub / ring / brand switcher | 单测路径已在 | 本轮不重做 |

活探测（本机）：

- Grok `~/.grok/bin/grok agent stdio`：`initialize` 成功，`loadSession: true`，带 `_x.ai/*`。
- Kimi `kimi acp`：成功，`loadSession: true`，`authMethods: login`。
- `npx -y @agentclientprotocol/claude-agent-acp@0.70.0` 与 `codex-acp@1.7.0`：无 stdout。未再杀进程复测。

---

## 文件地图

| 文件 | 职责 |
|---|---|
| `src/App.tsx` + `src/hooks/useAppModel.ts` | Wave 0：拆字段与返回值对齐 |
| `src/lib/session-agent.ts` | `bindSessionAgent`：打开行时锁定 `selectedAgentId` |
| `src/hooks/useAcpSession.ts` | `ensureAgent(agentId?)`；resume/send 用会话 agent |
| `src/lib/acp-host.ts` | pane 丢事件已有；补 `agentIdForSession` |
| `src-tauri/src/session_scan.rs` | 只把「像会话」的目录收进列表 |
| `src-tauri/src/lib.rs` `list_sessions` | 用扫描器；cwd 过滤不要误杀空 cwd 的他家行（或先填 cwd） |
| `docs/superpowers/specs/acp-probe/{claude,codex}.md` | 活探测结果替换默认 blob |
| `src/lib/agent-profile.ts` + `agent_host.rs` | 仅当探测改了 argv / pin 才动 |

---

## Wave 0 — 先让脏树能编、能开

不修这个，后面的 UI 验证都是假的。

### Task 0.1: 对齐 `useAppModel` 返回值与 `App.tsx` 解构

**Files:**
- Modify: `src/hooks/useAppModel.ts`（返回对象）
- Modify: `src/App.tsx`（只删/改对不齐的解构，不重做 P0–P2）
- Test: `src/lib/ui-chrome.test.ts`（`beginPaneDrag` 那段）

**判据：** `App.tsx` 解构的每个名字，hook 都导出；或 App 不再解构它。

- [ ] **Step 1:** 列出 App 解构但 hook 没有的字段（至少：`skillCommands`, `reviewCwd`, `reviewPlan`, `paneTree`, `focusedPaneId`, `extraPanes`, `paneDrag`, `paneCount`, `openIds`, `focusedSessionId`, `workColRef`, `extraChatEls`, `extraComposerRefs`, `extraMentionData`, `extraBusyStartRef`, `gitBusy`, `pullGit`, `pushGit`, `discardChange`, `newChatInFocus`, `openSession`, `splitRight`, `closePaneLeaf`, `beginPaneDrag`, `focusPane`, `onPaneRatio`, `onExtraDraftChange`, `onExtraAtBottom`, `onExtraQueue`, `gitWorktrees`, `switchWorktree`, `checkoutBranch`, `recapText`, `showRecap`, `dismissRecap`）。
- [ ] **Step 2:** 策略（二选一，优先 A）
  - **A（推荐）：** 脏 P0–P2 仍要保留时，把这些实现从隔离前的 dirty 备份 / `feat/p0-p2-optimization` 补回 `useAppModel`，再 isolation 提交 workbench 需要的 `selectedAgentId` 导出。
  - **B：** App 退回 HEAD 的单栏 API，P0–P2 分栏先不在本分支跑。只在用户明确放弃脏分栏时用。
- [ ] **Step 3:** `npx tsc -b --pretty false` 里 `App.tsx` / `useAppModel.ts` 无 TS2339。
- [ ] **Step 4:** `npx vitest run src/lib/ui-chrome.test.ts` 绿。
- [ ] **Step 5:** Isolation commit，例如 `fix: align App shell with useAppModel exports`。

**完成门：** `npm test` 不再因 `beginPaneDrag` 失败；本机 `npm run tauri dev` 能出窗口。

---

## Wave 1 — SessionRef 路由（规格硬约束）

规格原文：Resume on **that** agent’s child only.

今天：

```ts
// useAcpSession.ts ensureAgent()
await startAgent(selectedAgentIdRef.current);
// resumeSession
await ensureAgent();
await rpc("session/resume", { sessionId: s.id, cwd: s.cwd, mcpServers: [] });
```

`rpc` / `sendRaw` 都吃 `selectedAgentIdRef`，不吃 `s.agentId`。

### Task 1.1: 打开会话时绑定 agent

**Files:**
- Modify: `src/lib/session-agent.ts`
- Test: `src/lib/session-agent.test.ts`

**Produces:**

```ts
export function agentIdOfSession(s: { agentId?: string | null }): AgentId {
  return stampSessionAgent({ id: "_", agentId: s.agentId }).agentId;
}

/** 打开已有会话：chip 必须跟着走。新建空 composer 才用 chip。 */
export function selectedAgentAfterOpen(
  sessionAgent: AgentId,
  _currentChip: AgentId,
): AgentId {
  return sessionAgent;
}
```

- [ ] **Step 1:** 写测试：`{ agentId: "kimi" }` → `"kimi"`；缺省 → `"grok"`；打开 claude 行时 chip 从 grok 变成 claude。
- [ ] **Step 2:** 实现上面两个函数。
- [ ] **Step 3:** Commit `feat: bind composer chip to the opened session agent`。

### Task 1.2: `ensureAgent` / `rpc` 接受目标 agent

**Files:**
- Modify: `src/hooks/useAcpSession.ts`
- Test: `src/hooks/useAcpSession.test.ts`

**Produces:**

```ts
async function ensureAgent(agentId?: AgentId): Promise<void> {
  const id = agentId ?? selectedAgentIdRef.current;
  // startAgent(id)；已 ready 且当前 child 就是 id 才跳过
}

async function rpc(method: string, params: unknown, opts?: { dest?: PaneDest; agentId?: AgentId }) {
  const id = opts?.agentId ?? selectedAgentIdRef.current;
  await sendRaw({ jsonrpc: "2.0", id, method, params }, id);
}
```

`resumeSession(s)` / `openInPane` / `openSplit`：

```ts
const agentId = agentIdOfSession(s);
depsRef.current.setSelectedAgentId(selectedAgentAfterOpen(agentId, selectedAgentIdRef.current));
await ensureAgent(agentId);
await rpc("session/resume", { sessionId: s.id, cwd: s.cwd || undefined, mcpServers: [] }, { agentId });
```

`createAcpSession` / 空 composer 发送：继续用 chip 的 `selectedAgentId`。

- [ ] **Step 1:** 单测：resume 带 `agentId: "kimi"` 时 `startAgent` / `sendRaw` 的第二参是 `"kimi"`，不是 chip `"grok"`。
- [ ] **Step 2:** 实现。`readyRef` 必须按 agent 记（`Record<AgentId, boolean>` 或「当前 ready 的 id」），否则切 agent 会误跳过 boot。
- [ ] **Step 3:** ACP 事件：pane 存 `agentId`，`shouldDropAcpEvent(paneAgent, eventAgent)` 已存在，接上。
- [ ] **Step 4:** Isolation commit `feat: resume and rpc on the session agentId`。

### Task 1.3: 侧栏行带 agent 药丸（若还没有）

**Files:**
- Modify: `src/components/SessionBranch.tsx` 或 `src/lib/sidebar-list.ts`
- Test: `src/lib/sidebar-list.test.ts`

规格：每行有 agent pill。没有就加一个 4 色/`agentId` 短标签。有则本任务跳过。

---

## Wave 2 — 诚实的会话目录

规格允许 Claude 走 `~/.claude/projects/**` **and/or ACP list**。本机 `projects` 顶层是工作区 slug，不是 thread id。继续 `scan_named_subdirs` 会把 46 个文件夹推进独立对话。

Kimi 的 `wd_*` 看起来像会话，可先保留。Codex `~/.codex/sessions` 先保留一层。Claude **默认不扫 projects 顶层**。

### Task 2.1: 扫描策略按 agent 分开

**Files:**
- Modify: `src-tauri/src/session_scan.rs`
- Test: 同文件 `#[cfg(test)]`
- Modify: `src-tauri/src/lib.rs` `list_sessions`（isolation）

**Produces:**

```rust
pub enum ScanMode {
    ImmediateDirs,          // kimi / codex
    Skip,                   // claude until ACP session/list or deeper probe
}

pub fn scan_agent_sessions(root: &Path, agent_id: &str, mode: ScanMode) -> Vec<ScannedSession>
```

规则：

- `grok`：继续 `cached_sessions()`（`summary.json`），不要改成扫一层 cwd 编码目录。
- `kimi`：`ImmediateDirs`，跳过 `.` 开头。
- `claude`：`Skip`。列表改走 Wave 3 之后的 ACP `session/list`（能力位已在 kimi/grok initialize 里看到 `sessionCapabilities.list`）。探测前侧栏 **零条** Claude 假会话，好过 46 条垃圾。
- `codex`：先 `ImmediateDirs`；若本机那 1 个目录不是 thread，Wave 3 改 Skip。

`list_sessions` 里 `cwd` 过滤：他家行 `cwd` 为空时，**不要**在 `listSessions(someCwd)` 时被 `retain` 掉——要么扫描时填 `dir` 推出来的 cwd，要么过滤改为「空 cwd 视为未绑定，始终保留」。推荐后者，一测搞定：

```rust
out.retain(|row| {
    want.is_empty() || row.cwd.is_empty() || row.cwd == want
});
```

前端 `listSessions(null)` 已是全量；仍要修 Rust，避免以后按项目过滤时他家会话消失。

- [ ] **Step 1:** 测试：临时目录仿 Claude projects slug，`Skip` → 0 行；Kimi `wd_abc` → 1 行。
- [ ] **Step 2:** 测试：`cwd` 过滤保留 `cwd == ""` 的 kimi 行。
- [ ] **Step 3:** Isolation 改 `list_sessions`。
- [ ] **Step 4:** Commit `fix: stop listing Claude project folders as chats`。

### Task 2.2: 非 Grok 回放保持诚实空

`read_session_updates` / `find_session_dir` 已跨四家家目录。Grok 继续读 `updates.jsonl`。其它家没有该文件 → 空页，然后 Wave 1 的 `session/load` 灌 ACP。不要在本任务解析 Claude jsonl。

---

## Wave 3 — Claude / Codex 活探测后再谈 1:1

规格：Phase 0 写入 `docs/superpowers/specs/acp-probe/`，**不要猜 initialize**。

本机 pinned npx 无 stdout。先查清，再改 pin / argv / 能力位。未查清之前，composer 选 Claude/Codex 必须失败得明白（toast），不能假 ready。

### Task 3.1: 受控探测脚本（只写文档 + 本机一次）

**Files:**
- Modify: `docs/superpowers/specs/acp-probe/claude.md`
- Modify: `docs/superpowers/specs/acp-probe/codex.md`
- Modify: `docs/superpowers/specs/acp-probe/README.md`

探测清单（手工或一次性脚本，**不要 pkill 用户进程**）：

1. `npx -y @agentclientprotocol/claude-agent-acp@0.70.0` 的 stderr / 退出码 / 是否在等 stdin 以外的东西。
2. 包的 `--help` / README 是否要求 `claude` 在 PATH、或不同 subcommand。
3. Codex 包同样。
4. 若官方改名或要 `@agentclientprotocol/claude-agent-acp@<其它>`，把 pin 写进 `CLAUDE_ACP_PKG` / `CODEX_ACP_PKG` / `agents.toml` / `agent-profile.ts`。
5. 把 **真实** initialize 回复（`agentCapabilities`、`authMethods`）贴进 probe 文档，替换「spec default, not live dump」。

Grok / Kimi 已有活结果，补进 `grok.md` / `kimi.md`（`loadSession: true`；Kimi `authMethods: login`）。

- [ ] **Step 1:** 跑探测，记录 stderr 首屏。
- [ ] **Step 2:** 更新四份 probe md。
- [ ] **Step 3:** 能握手再改 spawn；不能握手则 `start_agent` 对 claude/codex 返回明确错误字符串（已有「无法解析 / 启动失败」），前端 toast，**不要**把 `ready` 置 true。
- [ ] **Step 4:** Commit `docs: record live ACP initialize for four CLIs`（及如有的 pin 变更）。

### Task 3.2: 有 `session/list` 再并进侧栏

仅当 Wave 3.1 证明该 child advertise `sessionCapabilities.list`：

- initialize 之后对该 child `session/list`。
- 把结果标上 `agentId`，union 进 `list_sessions`（或前端二次合并）。
- 仍不要扫 Claude projects 顶层。

未 advertise 就保持 Wave 2 的 Skip。

---

## Wave 4 — 首启身份（壳子能开之后）

`load_webui_state` 已会：拷 `webui.json` → `workbench.json`、写 `agents.toml`、`default_inbox_cwd` = `Documents/Agent Chats`。脏树没开起来所以磁盘是旧的。

- [ ] Wave 0 之后冷启动一次，断言：
  - `~/.acp-workbench/agents.toml` 含 `@0.70.0` / `@1.7.0`（或 Wave 3 新 pin）
  - `workbench.json` 有 `lastAgent`（迁移逻辑已写；旧文件缺字段时补一次）
  - 新用户 `ensure_inbox(null)` → `~/Documents/Agent Chats`
  - 已有 `inboxCwd` 指向 `Grok Chats` 的不要改
- [ ] 缺 `lastAgent` 的旧 `workbench.json`：`migrate_workbench_doc` 已插默认 `"grok"`；确认 `load` 对「已存在、无 lastAgent」的文件也会跑 migrate，而不是只在 copy 路径跑。若只在 copy 跑，补一行 isolation：已存在文件也 `migrate_workbench_doc`。

---

## Wave 5 — 验收门（代替「单测绿即完成」）

每条必须有本机证据（命令输出或窗口操作），不能只靠「没看到问题」。

| # | 动作 | 期望 |
|---|---|---|
| 1 | 当前脏树 `npx tsc -b`（至少 App + hook）+ `npm test` | 无 Wave 0 类失败 |
| 2 | `npm run tauri dev` | 主窗口出来，composer 有 agent chip |
| 3 | chip=Grok，发一条短消息 | Grok child、Grok 会话 |
| 4 | 侧栏点一条 **Kimi** 行 | `startAgent("kimi")` + `session/resume` 的 agent 是 kimi；Grok child 仍在 |
| 5 | 侧栏 Claude | 在 ACP list 就绪前：**没有** 46 条 projects 垃圾行 |
| 6 | chip 切到 Claude/Codex | 能握手则 initialize；不能则 toast，不假 ready |
| 7 | Settings 总览 | 四条 doctor；API key 的那家不画订阅环 |
| 8 | Usage 叠加 | `全部 \| Grok \| Kimi \| Claude \| Codex` |
| 9 | Hub | `skills \| mcp \| marketplace \| hooks`；MCP 开关写四家 live，不删 `~/.agents/mcp.json` |

Rust：`cargo test --manifest-path src-tauri/Cargo.toml --lib`（不要沙箱跑 git hook 测试）。

---

## 明确不做

- 不重写四家 vendor 会话格式。
- 不把 MCP/Skills 从 `~/.agents` 拆回 Grok hub。
- 不修 Imagine/video。
- 不在本方案里做完整 AdminPort Rust trait 搬迁（规格大表）。doctor / list / delete 维持现有命令 + 本方案补丁。
- 不 `git add -A`，不把 P0–P2 和本方案糊成一个提交。

---

## 建议提交顺序

1. `fix: align App shell with useAppModel exports`
2. `feat: bind composer chip to the opened session agent`
3. `feat: resume and rpc on the session agentId`
4. `fix: stop listing Claude project folders as chats`
5. `docs: record live ACP initialize for four CLIs`（+ 必要 pin）
6. `fix: migrate lastAgent on existing workbench.json`（若 4 需要）

每条独立可测。Wave 0 未过不要开始 Wave 1 的 UI 验收。
