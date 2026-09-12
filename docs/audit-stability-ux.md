# 稳定性与体验审计

审计对象：`feat/multi-agent-workbench` 工作树当前状态。所有结论经实际执行或代码阅读确认，未验证项已标注。

与 `multi-cli-fix-plan.md` 的关系：该文档覆盖多 CLI 会话读取与性能；本文档覆盖构建健康、稳定性缺陷、诊断与体验。两者无重叠。

---

## B0 产线构建是断的（最高优先级）

`npm test` 全绿（159 文件 / 1253 测试 / 2.44s），但 `npm run build` 失败。

原因：`package.json` 的 build 是 `tsc -b && vite build`，而 `tsc` 报 **52 个类型错误**。vitest 不做类型检查，所以测试全绿完全掩盖了这一点。

**任何「单测绿即完成」的验收标准在当前仓库都是失效的。**

错误分布：

| 类型 | 数量 | 性质 |
|---|---|---|
| TS2307 `Cannot find module 'node:fs'` | 33 | 配置问题，见 B0-1 |
| TS6133 未使用变量 | 4 | 真实（`noUnusedLocals: true`）|
| TS7006 隐式 any | 3 | 真实 |
| TS2556 spread 非元组 | 3 | 真实 |
| TS2322 / TS2339 / TS2739 / TS2353 / TS2345 | 9 | 真实类型不匹配 |

非测试文件中的 8 处（这些是真实代码缺陷）：

```
src/lib/session-update-batch.ts(16,3)   TS2739  Record<string,unknown> 缺 ChatState 的 items/nextId/plan/artifacts/commands
src/lib/session-update-batch.ts(16,57)  TS2345  同上，reduce 累加器类型错
src/hooks/usePermissionQueue.ts(64,63)  TS2353  'agentId' 不存在于 QueuedPermission
src/lib/agent-port.ts(16,18)            TS2322  返回 Promise<{ok,grok,agentId}> 声明为 Promise<void>
src/components/ExtensionsHub.tsx(450)   TS2322  Promise<string> 不能赋给 Promise<void|GrokRunResult>
src/components/ExtensionsHub.tsx(459)   TS2322  同上
src/hooks/useAcpSession.ts(39,10)       TS6133  INBOX_PIN 未使用
src/lib/permission-queue.ts(2,37)       TS6133  PermissionPane 未使用
```

`session-update-batch.ts:16` 值得单独注意——它在**每条流式更新的热路径**上，`foldSessionUpdates` 的 reduce 累加器类型是错的。运行时目前正常，但类型已经失去保护。

### B0-1 补 `@types/node`

33 个 TS2307 的成因：测试文件 import `node:fs` / `node:path` / `node:url`，但

- `@types/node` **未安装**（`node_modules/@types/` 下没有）
- `tsconfig.json` 的 `"types": ["vitest/globals"]` 显式收窄了类型范围，即使装了也不会自动生效

修法：装 `@types/node`（devDependency，pin 版本），并把 `"node"` 加进 `types` 数组。

**验收**：`npx tsc --noEmit` 零错误，`npm run build` 成功产出 `dist/`。

### B0-2 把类型检查纳入验收

现状允许「测试全绿但构建失败」的状态存在并被当成完成。

要求：`tsc --noEmit` 通过是所有任务的完成前置条件，与 `npm test` 并列。

---

## B1 stderr 事件丢失 agent 归属，导致跨 agent 串台

`src/api.ts:421` 的 `onAcpStderr` 是四个事件订阅里**唯一丢弃 agentId** 的——`onAcpMessage`、`onAcpRequest`、`onAgentExit` 都正确透传。

后果在 `src/hooks/useAcpSession.ts:641-651`：

```ts
const c = await onAcpStderr((line) => {
  if (shouldClearBusyOnAgentStderr(line)) {
    busyRef.current = false;
    setBusy(false);              // ← 主窗格 busy
    pendingPrompt.current = null;
    if (notice) setChat(...)     // ← 主窗格 chat
  }
  if (msg) depsRef.current.showToast(msg);
});
```

`setBusy` / `setChat` 操作主窗格。判定条件 `shouldClearBusyOnAgentStderr`（`src/lib/text.ts:93`）匹配 `[SYSTEM_ERROR]` / `Authentication required` / `Prompt for session … failed`。

**可复现路径（已确认可达）**：主窗格与分屏窗格可绑定不同 agent——`openInPane`（`useAcpSession.ts:914-928`）从会话推导 `pane.agentId`，`mainAgentIdRef` 独立维护，后端 `AgentPool` 每 agent 一个进程。所以主窗格 grok + 分屏 claude 是正常用法。此时 claude 吐 `Authentication required`：

1. grok 正在进行的回合被误判结束，主窗格 composer 提前解锁
2. grok 的对话流插入一条不属于它的错误气泡
3. toast 只有错误文本，不标明来自哪个 CLI

**要求**
- `onAcpStderr` 透传 agentId，与其余三个订阅一致
- 清 busy / 注入失败气泡前判断来源 agent 是否匹配窗格绑定的 agent。`session/update` 已有现成做法可参照：`shouldIgnoreAcpEvent(paneAgent, eventAgent)`（`useAcpSession.ts:614`）
- toast 带 CLI 名称

**验收**：主窗格 grok 跑长回合，同时让分屏 claude 报认证错 → grok 回合不受影响、无异常气泡、toast 标注 claude。补测试。

---

## B2 agent 退出的 busy 清理方向反了

`src/hooks/useAcpSession.ts:652-671`：

```ts
const exit = await onAgentExit((eventAgent) => {
  readyByAgentRef.current[eventAgent] = false;
  delete agentBoots[eventAgent];
  if (eventAgent !== selectedAgentIdRef.current) return;   // ← 问题 1
  ...
  d.setExtraPanes((prev) => {                              // ← 问题 2
    for (const [id, pane] of Object.entries(prev)) next[id] = { ...pane, busy: false };
  });
});
```

两个方向都错：

1. **非当前 agent 退出时第 655 行直接 return** → 绑定到该 agent 的分屏窗格 `busy` 永不清零，转圈卡死，只能重启应用
2. **当前 agent 退出时第 664-668 行无条件清空所有分屏窗格 busy** → 绑定到其他健康 agent、仍在正常跑的窗格提前失去 busy 状态

正确语义：按 `pane.agentId === eventAgent` 精确匹配清理，与「哪个 agent 被选中」无关。`ExtraPaneState` 已有 `agentId` 字段（`useAcpSession.ts:205`），判断依据是现成的。

**验收**：分屏跑 claude 并手动 kill 其进程 → 该窗格 busy 清零并提示，主窗格 grok 不受影响；反向同理。补测试覆盖两个方向。

---

## B3 「未安装」被误报成「未登录」

`src-tauri/src/lib.rs:385-388` 的 `doctor_all` 对四个 agent 全部硬编码 `binary: None, acp_spawn_ok: false`：

```rust
doctor_from_evidence("grok", …, None, false),   // ← binary 恒 None，acp_spawn_ok 恒 false
doctor_from_evidence("kimi", …, None, false),
doctor_from_evidence("claude", …, None, false),
doctor_from_evidence("codex", …, None, false),
```

而 `src/lib/agent-doctor.ts:27` 的 `agentSendBlockReason` 只看 `authPresent`。于是无论 CLI 装没装，提示统一是「XX 未登录」。用户没装 kimi 时看到「Kimi 未登录」会去查登录，真实问题是没安装——排查方向被带偏。

**能力已存在，只是没接线**：
- `src-tauri/src/agent_host.rs:71` 的 `which_on_path` 可用，且据近期提交已覆盖 Homebrew 与 `~/.local/bin`
- `AgentDoctorDto` 已有 `binary` / `version` / `acp_spawn_ok` 三字段
- 前端 `src/lib/agent-auth.ts` 已写好消费这三个字段的逻辑，但**零调用者，是死代码**

**要求**
- `doctor_all` 用 `which_on_path` 真实探测可执行文件，填 `binary`（可行则补 `version`）
- `agentSendBlockReason` 区分未安装 / 已装未登录 / 就绪，文案分开
- 接上 `agent-auth.ts` 或删掉，不要留死代码
- `acp_spawn_ok` 若暂不做真实探测就从 DTO 移除，别留恒 false 的字段误导后续开发

**验收**：临时改名一个 CLI 使其不可见 → 提示「未安装」并给安装指引。

---

## B4 登录引导是死路

- `src/lib/agent-doctor.ts:23` 的 `defaultLoginHint` 对所有 agent 一律返回 `["login"]`，无视四家登录方式不同
- `loginHint` 字段**没有任何 UI 消费**（全库搜索只出现在类型定义与构造处）
- `src/components/DoctorsOverview.tsx` 只渲染 `doctorOverviewLine`，而后者（`src/lib/agent-port.ts:30`）只输出 `agentId · 未登录/API/已登录`

结果：用户选中未登录的 CLI，得到一句「Claude 未登录」toast，然后没有下一步——不显示该跑什么命令，没有按钮，设置页重复同一句话。

**要求**
- 按 agent 给出各自真实登录方式
- 在设置页健康列表与阻断提示处呈现引导，至少可复制命令
- `DoctorsOverview` 一并展示 binary/version（依赖 B3），让「装了没 / 哪个版本 / 登录没」一屏可见

---

## B5 许可队列的 agentId 靠类型断言

`src/hooks/usePermissionQueue.ts:47,54` 用 `(request as { agentId?: AgentId }).agentId` 取值，但 `QueuedPermission`（`src/lib/permission-queue.ts:44`）没声明该字段。

这正是 B0 中 `usePermissionQueue.ts(64,63) TS2353` 的成因——入队处写 `agentId` 已经是硬错误，读取处用 `as` 绕过了检查。

运行时逻辑目前正确，但类型保护已失效：将来重构漏传 agentId 编译器不会报错，许可会回给错误的 agent。

**要求**：把 `agentId: AgentId` 加进 `QueuedPermission` 声明，去掉两处 `as` 断言。

---

## 审计确认无问题的部分

以下经检查未发现缺陷，**不要动**：

- **错误处理规范**：145 处 catch，12 处静默吞错全部标注了 best-effort 原因，是有意为之而非漏写
- **ErrorBoundary**：已在 `src/main.tsx:21` 包裹根组件
- **Rust panic 风险**：`skill_sync.rs` 的 40 处 unwrap 全在 `#[cfg(test)]` 内；非测试区仅 3 处且有前置判断；全库无 `panic!` / `unreachable!` / `todo!`
- **进程清理**：`stop_one` / `stop_agent_inner` 有 `start_kill` + 2s 超时兜底，spawn 带 `kill_on_drop(true)`；窗口关闭按 `hide_on_close` 决定隐藏或退出，路径正确
- **RPC 白名单**：`cargo check` 告警 `rpc_payload_allowed` 未使用，但这是**虚警**——真正的校验 `rpc_payload_allowed_for` 已在 `lib.rs:513` 按 agent caps 生效，未使用的只是 grok 遗留包装。可删包装，但没有安全漏洞
- **多 agent 状态机主体**：`readyByAgentRef` / `agentBoots` 已按 agent 分离，`session/update` 有 `shouldIgnoreAcpEvent` 过滤。B1/B2 是这套机制的两处遗漏，不是机制本身有问题
- **Rust 编译**：`cargo check` 通过，11 条告警均为未使用函数（`adapters::sessions_for`、`agent_registry::spawn_args_from_toml` 等），属接线未完成，非缺陷

---

## 建议顺序

1. **B0-1 + B0-2**：先让构建能过。在此之前任何「完成」判定都不可信
2. **B0 的 8 处非测试类型错误**：其中 B5 顺带解决
3. **B1、B2**：两个稳定性缺陷，均可导致界面卡死或误报，改动局部
4. **B3、B4**：诊断与引导，影响新用户首次可用性
5. Rust 侧未使用函数按接线计划处理，或明确删除

## 执行约束

- 完成判定 = `npm test` 绿 **且** `npx tsc --noEmit` 零错误 **且** `npm run build` 成功
- B1/B2 必须补测试覆盖跨 agent 场景，这类缺陷靠手测容易漏
- 修 B0 的类型错误时不要用 `any` 或 `@ts-ignore` 绕过，`session-update-batch.ts` 在热路径上，类型要真正修对
