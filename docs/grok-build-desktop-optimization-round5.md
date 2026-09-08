# Grok Build Desktop 优化参考文档（Round 5 · 全量分析 + 50 条建议）

- 日期：2026-09-08
- 基线：分支 `feat/multi-agent-workbench`，最新提交 `2dae916`（v0.6.2）+ 若干未提交改动（ghost-streaming-heal 语义反转、subagent-tree/live-roster/ime-enter/composer-attach 等）
- 方法：6 个并行探查代理分别通读 ①产品/设计文档与 CHANGELOG、②Rust 后端（25 文件 ~13.3k 行）、③前端组件层（98 文件）、④ACP 会话/状态层（hooks + api）、⑤src/lib 流式管线（353 文件）、⑥消息交互流程（权限/计划/通知/队列）。关键结论已抽样回读源码核实。
- 体感强弱：★☆☆ 微弱 → ★★★ 强（每天都会撞上）

---

## 第一部分 · 全景摘要

**产品定位**：给 coding agent 用的原生桌面工作台——「聊天、会话、许可、Git、文件审阅在桌面完成；模型循环仍在各家 CLI 里」。支持 Grok / Kimi / Claude / Codex 四个 CLI（无 Gemini，`src-tauri/src/agent_host.rs:7-33` 封闭枚举），每个 agentId 池内单进程，ACP（JSON-RPC over stdio）接入。

**架构**：React 19 壳层（无路由/无状态库，~370 个解构值从 `useAppModel()` 一次性下发）→ Tauri 命令/事件（86 个 command、6 类 event，事件统一带 `{agentId, generation}` 标签防串台）→ Rust `agent_host`/`acp_loop`/`adapters`（spawn + 读写循环 + 主机代答 fs 请求）→ CLI 子进程。

**规模**：前端 204 个测试文件 / Rust 212 个 `#[test]`；三条 Playwright e2e；源码中零 TODO/FIXME（设计意图都写在 doc comment 里），整体代码纪律很好。

**工程基调（值得保持的优点）**：虚拟滚动锚定恢复严谨；PermissionCard/QuestionCard 有 1-9 热键；IME 组合期防误发；`prefers-reduced-motion` 全局降级；「诚实空态」原则；frost 主题用测试锁定 CSS 结构；错误路径有六重 busy 清除保险。

**本分支未提交改动的观察**：`ghost-streaming-heal` 的 heal 条件从 `!sendInFlight` 反转为 `sendInFlight`（`src/lib/ghost-streaming-heal.ts:32-38`，测试同步反转）。新语义只覆盖「prompt 还没写出去」的场景，**主动放弃了「prompt 已写出但 agent 挂死」的自动恢复**——这是本档 P0-4 的由来。

---

## 第二部分 · 维度一：用户交互体验

### 现状
- **壳层**：`App.tsx`（1624 行）单文件承载侧栏 + 线程区 + 右栏 ReviewRail + 全部覆盖层；主窗格（App.tsx:817-1186）与分屏叶子（App.tsx:378-641）是两套相似但功能不对等的 JSX。
- **Composer**：附件（拖放双通道 + 粘贴转存）、@ 提及（竞态保护）、斜杠命令（26+ 条本地命令）、模式芯片（agent/plan/yolo，yolo 二次确认，Shift+Tab 循环）、发送队列（cap 10，拖拽/Alt+↑↓ 重排）、UsageRing 上下文环、TTFT/tok/s 统计行。
- **线程**：work-run 折叠 + spine 时间线、>80 块自动虚拟化、jumpId 跳转高亮、`aria-live` 直播区、diff 行级折叠、Markdown LRU 缓存 + Mermaid 懒加载。
- **主题**：paper/ink/frost 三族 × light/dark，OKLCH 令牌，密度可调，frost.css 结构性覆盖置最后加载。

### 主要弱点（详见 50 条）
1. **分屏是二等公民**：缺 rewind/fork/工具检查/跳转高亮/GitChip/子代理 chip，排队消息不能编辑（App.tsx:517-541、611-618）。
2. **键盘可用性断层**：mention/slash 菜单不支持方向键；Shift+Tab 被完全劫持；选中文本工具条只认鼠标 + 只认 assistant 消息；侧栏多选仅鼠标；MillerPicker 不能返回上级。
3. **错误呈现粗糙**：Rust/IPC 原始错误串 `String(e)` 直接上屏；stderr 过滤白名单只认英文关键词；失败回合无重试按钮。
4. **反馈缺口**：新会话空态可能整片空白；附件 ingest 无 pending 态；ExtensionHub 加载无骨架；jobs 芯片是死按钮。

---

## 第三部分 · 维度二：ACP / CLI 信息流

### 现状
- **事件协议**：`acp-message` / `acp-request` / `acp-stderr` / `agent-exit`（载荷为 null，**不含退出码**）/ `grok-cli-log` / `workspace-changed` / `notify-open`。Rust 侧不过滤旧代事件，靠前端按 generation 丢弃。
- **流式管线**：stdout 逐行 → `acp-message` → `sessionUpdateDest` 按 sessionId 路由 pane → `enqueueSessionUpdate` 桶 → **rAF 每帧一批** flush → `foldSessionUpdates`/`applyChatUpdate` 折叠进 ChatState。`turn_completed`/`auto_compact_*` 旁路立即刷。
- **CLI 差异吸收点**：harness 前缀过滤（claude）、`swarm` spawn 别名（kimi）、`formatted_output` 兼容（grok/codex/kimi）、usage 字段 snake/camel 双读；会话列表 = 磁盘扫描 ∪ ACP `session/list` ∪ 乐观占位行三方合并。
- **恢复机制**：replay 字节游标增量续放；host crash heal（agent-exit → open tool 全部标 cancelled + fail 卡片）；ghost heal（45s）；stall 提示（15s/60s）；settle 看门狗（4s 无输出且有 assistant 文本）。

### 主要弱点
1. **Rust 侧 IO 无界**：stdout/stderr 单行无长度上限（`BufReader::lines`）；`acp-log` 事件无节流（前端还没人听）；`read_token_turns` 对每个 updates.jsonl 全文 `read_to_string`（cli_bridge.rs:1704）。
2. **超时缺口**：`doctor --version` 与 `inspect_brief` 的 `output().await` 无超时（lib.rs:531-541、1769-1774）；`run_grok_stream` 超时后进程孤儿化。
3. **initialize 无看门狗**：`agent_manifest.rs` 里的 20s 超时常量是死代码；claude/codex 经 npx 启动 12s 零 stdout 的场景只能靠前端 20s initialize 超时兜底。
4. **崩溃信息贫乏**：`agent-exit` 不带退出码/信号，Rust 侧从不 `wait()` 采集 ACP 子进程 status，前端无法区分崩溃/正常退出/认证失败。
5. **隐藏窗口时 rAF 停摆**：pendingByPane 桶无上限、无兜底 flush，后台会话的流式文本持续堆积。

---

## 第四部分 · 维度三：与用户的消息交互流程

### 现状
- **发送**：空闲直接发；忙时按 `steerByDefault` 分流为 steer（再发一个 `session/prompt`）或入队；Alt 发送反转策略；队列满把文本还给草稿。
- **权限**：`acp-request` → `usePermissionQueue`（90s 倒计时，**到时只提示不拒绝**）→ PermissionCard/QuestionCard 挂到对应 pane 的 Composer（takeover）；yolo 只自动放行 permission 类；「此会话内记住」工具记忆是内存级。
- **计划**：plan update 折叠进 `chat.plan`；PlanCompleteCard 在全部 todo completed 时出现；approve → 发 `/auto`；reject 只本地 toast。
- **中断**：停止按钮 + Esc 双击确认（3s 窗口）；取消连带取消待决权限卡；已入队消息保留。
- **通知**：turn 完成/新权限卡发 OS 通知；未读按 done/error 终态持久化；dock 徽标数 needs-you 会话。**通知点击深链断裂**（`setNotifyTarget` 从未被调用）。

### 主要弱点
1. **流程断点**：通知点击不跳会话；分屏排队消息不能编辑；plan reject 不回传意见；busy 时切模式只 toast「下一轮生效」。
2. **输入增强缺失**：无 ↑ 输入历史；question 无自由文本回答通道。
3. **i18n 半成品**：`t()` 双语表 707 键完全对齐，但 lib 层约 30+ 文件 150+ 条硬编码中文（run-status、session-status、commands、sidebar-list、tool-render、work-run-copy 等），英文模式下照常显示中文。
4. **信号噪音**：dock 徽标把全部历史 error 都算进去；`perm.timeout` 等死文案残留。

---

## 第五部分 · 50 条升级/修补建议

优先级定义：
- **P0**：崩溃/安全/数据丢失级，或每天高频撞上的体感黑洞。建议本迭代内完成。
- **P1**：明确的功能缺口或明显粗糙点，用户可感知。建议按域分批落地。
- **P2**：打磨、性能优化、还债。可穿插在日常迭代。

### P0（10 条）

**1. 拆除 Rust 侧 4 个 panic 点（任一触发 = 整个应用退出）**
- 问题：release profile `panic="abort"`，以下 4 处 panic 均可由用户/agent 输入触发：`acp_loop.rs:48` 对 String 按字节 `truncate(2MB)`，边界落在多字节 UTF-8 中间必 panic（agent 发起的 fs 读请求 = 远程可触发）；`lib.rs:2695`、`mcp_toml.rs:7`、`cli_bridge.rs:1291` 的 `as_table_mut().expect(...)`，当 `config.toml` 里 `models = "x"` / `mcp_servers = 5` / `compat = "x"`（键存在但非表）时必 panic。
- 建议：truncate 改为按 `floor_char_boundary` 语义截断（或先按字节切再 `from_utf8_lossy`）；三处 expect 改为 `as_table_mut().ok_or_else(...)` 走 AppError 返回友好报错。补一个「用户 config 写坏类型」的负例测试。
- 体感：★★★（当前是「改一下配置文件 → 整个 app 闪退」）。

**2. 收敛 `read_text_file` 的敏感文件读取面**
- 问题：Rust 读取白名单 `is_blocked_path` 只挡 `.ssh/.gnupg/.grok/auth.json`（lib.rs:368-375），而 `allow_text_read` 允许 `$HOME` 下任意文件——tauri.conf asset 协议的 deny 列表（`.aws/.kube/.config/Keychains` 等）没有在 Rust 命令侧复刻，前端被注入时可读 `~/.aws/credentials`。
- 建议：把 tauri.conf 的 deny 列表提为共享常量，`read_text_file`/`restore_text_file`/`write_allowed_text` 统一走同一套校验；补 symlink 与路径穿越负例测试。
- 体感：☆☆☆（安全债，但属必须修）。

**3. CSP 收紧：去掉 `connect-src https:` 通配**
- 问题：`tauri.conf.json:26` 的 `connect-src ... https:` 允许 webview 向任意 https 主机发请求；`style-src 'unsafe-inline'` 保留但应评估收敛。当前应用内只该连 localhost dev server 与（如需）用量 API 域名。
- 建议：枚举实际需要的 host（`ipc:`、`http(s)://ipc.localhost`、dev server、_x.ai billing 域名等）；用量轮询如需任意域，改为 Rust 侧代理请求。
- 体感：☆☆☆（安全债）。

**4. 补齐「已发出但 agent 挂死」的恢复路径（ghost heal 盲区）**
- 问题：未提交改动把 heal 条件限定为 `sendInFlight=true`（`ghost-streaming-heal.ts:32-38`），rpc 发出后即清零（useAcpSession.ts:1537-1539）。此后 agent 卡死（不流 token、不回 result、尾部已有 thought/tool）时：`findOptimisticGhostTurn` 返回 null、settle 看门狗因无 assistant 文本不触发，busy 永久 true，只剩 60s stall 文案，需手动 Esc 取消。
- 建议：建立统一的「挂起看门狗」：`busy && 距最后活动 ≥ 90s && 无 pendingPermission && 无 open tool` 时弹恢复横幅（不自动删气泡）：[重发] [转回草稿] [继续等]；ghost 自动 heal 保留为 45s 的快路径。extra pane 也要覆盖（当前只有主 pane 有 heal）。
- 体感：★★★（卡死时整个工作台像死机，只能重启）。

**5. `agent-exit` 携带退出码并做崩溃分类**
- 问题：`acp_loop.rs:180-183` 发出 `agent-exit` 载荷为 null；Rust 从不 `child.wait()` 采集 ACP 子进程 status，前端无法区分「正常退出 / 崩溃 / 被 kill / 认证失败启动即退」，一律 toast「已退出」+ disconnected。
- 建议：reader 结束后 `try_wait()`/`wait()` 拿 `ExitStatus`（code/signal）塞进 payload；前端按类别分级呈现：启动后 3s 内退出 → 引导 doctor/登录；code 0 且空闲 → 静默标记；非 0 → 「{Agent} 崩溃（code N）」+ 一键重启按钮。
- 体感：★★★（崩溃后用户不知道该重连、重登还是重装）。

**6. 打通通知点击深链**
- 问题：前端监听 `notify-open` 跳转会话（useAppModelEffects.ts:169-181），Rust 只有设置了 `notify_target` 才会 emit（lib.rs:3386-3394），但 `setNotifyTarget`（api.ts:341）**全项目零调用**——点击通知只聚焦窗口，不打开对应会话。
- 建议：在发通知的地方（useAppModelEffects.ts:297-304 等）先 `setNotifyTarget(sessionId)`，窗口聚焦后清空；点击未读横幅/托盘同样复用。
- 体感：★★☆（多会话并行时通知点过去还要自己找会话）。

**7. stdout/stderr 读取加界 + IPC 事件限流**
- 问题：`acp_loop.rs:121,188` 用 `BufReader::lines()` 无单行上限，一条超大 JSON 行或海量日志行会无界吃内存；`acp-log`/`acp-stderr` 无节流（前端甚至没人消费 `acp-log`），CLI 刷屏时 IPC 风暴拖垮 webview。
- 建议：改 `BufReader` 手动 `read_until(b'\n')` 带 1MB 行上限（超限截断并标记 `truncated:true`）；`acp-log` 要么删除、要么环形缓冲 + 50ms 合并发射；stderr 连续行做 200ms 合并。
- 体感：★★☆（长输出工具调用时 UI 掉帧、内存上涨）。

**8. `doctor` / `inspect_brief` 加超时，`run_grok_stream` 超时杀进程**
- 问题：`lib.rs:531-541` 的 `--version` 与 `lib.rs:1769-1774` 的 `grok inspect --json` 用 `output().await` 无超时，CLI 挂起则命令永久挂起（同文件 `cli_version_of` 有 2s 超时，说明这是遗漏不是约定）；`cli_bridge.rs:393-433` 的 `run_grok_stream` 超时返回 Err 但不 kill child，进程孤儿化且日志事件继续刷。
- 建议：统一用 `tokio::time::timeout` 包裹（版本探测 2s、inspect 15s）；stream 超时路径显式 `child.start_kill()` + abort 两个转发任务。
- 体感：★★☆（设置页「检测中…」转圈不消失）。

**9. 流式 Markdown 渲染降频 / 增量化**
- 问题：流式期间 live 消息跳过 LRU 每帧全量 `renderMd`（Markdown.tsx:36），超长回复在低帧率设备上明显卡顿；LRU key 是全文（markdown-cache.ts:7），对正在生长的文本天然无效。
- 建议：live 消息按 trailing-edge 节流（100–150ms）重解析；或增量策略——已稳定的前缀段落缓存、只重解析最后一个未闭合 block；AST 级增量过重的话，段落级切分 + LRU 段缓存即可收益明显。
- 体感：★★★（长回复打字机阶段的掉帧最伤「高级感」）。

**10. 收敛 `liveTick` 引发的每秒全树重渲染**
- 问题：busy 时 `liveTick` 每秒 +1 进入 `rowCtx` 依赖（Thread.tsx:510、654-658），所有 `ChatRow` 的 memo 每秒失效一次；≤80 块的非虚拟模式下每 tick 全量 diff；叠加 1s settle tick 遍历全部 pane×items（useAcpSession.ts:542-557）。
- 建议：把「已运行 N 秒」类展示拆成自带定时器的叶子组件（局部 setState 不上提）；`rowCtx` 剔除 tick，改为按行需要的粒度（如仅 WaitPill/stall 行订阅）；settle tick 只扫 busy 的 pane。
- 体感：★★★（同上，是 round4 文档点名的「最大体验黑洞」的另一半）。

### P1（24 条）

**11. 大文件读取全量收口**：`read_token_turns` 对每个 updates.jsonl 全文 `read_to_string`（cli_bridge.rs:1704），数百 MB 会话内存峰值不可控——统一改尾部限量读（同 `read_updates_jsonl` 的 4MB 尾读模式），并给会话数加预算。

**12. 权限流程三处修正**：① 90s 超时后卡片仍占队首只剩提示（usePermissionQueue.ts:100-108）——超时后折叠成「已等待 N 分钟」的可展开项，不再阻塞后续卡片；② 勾选「记住」后「允许这次」按钮实际语义变成 always（PermissionCard.tsx:73-80）——勾选时动态改按钮文案；③ always-allow 仅内存、重启即失（permission-queue.ts:11-21）——按 `agentId+cwd+tool` 持久化到 workbench.json，并在设置里加已授权工具管理列表（可撤销）。

**13. 统一 pane 渲染器，消灭分屏二等公民**：`renderSplitLeaf` 与主窗格两套 JSX 大面积复制（App.tsx:378-641 vs 817-1186），分屏缺 rewind/fork/onInspectTool/jumpId/highlight/GitChip/DiffSummary/jobs/子代理 chip/onEditQueued。抽 `<WorkPane>` 组件以能力位配置差异，顺带把 App.tsx 拆薄。

**14. 修死按钮：jobs 芯片**：头部 jobs 弹出菜单每一项 onClick 只关菜单（App.tsx:912-918）。要么点条目跳到对应会话/工具详情，要么删掉入口。

**15. SelectionActions 按焦点路由**：现在 `document.querySelector(".composer textarea")` 全局取第一个输入框（App.tsx:1580-1588），分屏聚焦时「改写/引用」打进错误 pane。改为向 `focusedPaneId` 的 composer ref 写入。

**16. mention/slash 菜单键盘导航**：Composer onKeyDown 无 ArrowUp/Down/Tab 处理（Composer.tsx:578-653），`SlashMenu` 的 active 恒为 0、Enter 永远选第一项（Composer.tsx:750）。补齐方向键 + Tab 循环 + Enter 选中高亮项。

**17. 归还 Shift+Tab**：textarea 内 Shift+Tab 一律切模式（Composer.tsx:579-589），键盘用户失去反向移出输入框的能力。仅当无菜单激活时切模式，或改 Ctrl+Shift+Tab 之类组合。

**18. 选中文本工具条覆盖键盘与更多消息类型**：`useTextSelection` 只在 pointerDown 流程发布且只认 `.msg.assistant`（useTextSelection.ts:18,41-61）。支持键盘选择（selectionchange + 修饰键策略）并扩展到 user/tool 消息；补充 Escape 关闭外的可见关闭钮。

**19. 侧栏多选键盘支持**：shift/meta 修饰取自 mousedown 捕获（Sidebar.tsx:259-285），键盘无法进入多选。给会话行加可选焦 + Space 勾选语义。

**20. MillerPicker 可返回上级**：`millerPush` 只进不退（MillerPicker.tsx:34-57），无 back/面包屑。加顶部面包屑 + Backspace 返回。

**21. 错误文案映射表**：横幅/设置/UsageStats/MemoryWorkspace 等十余处直接 `String(e)` 上屏（App.tsx:779,791、Settings.tsx:224,448,482,498 等）。建 `lib/error-copy.ts`：识别 AppError 字串特征 → 本地化友好文案 + 「查看详情」折叠原始错误；Rust 侧顺手给 AppError 加错误码字段（当前只有 message，lib.rs:66-78）。

**22. 发送失败回滚草稿**：`dispatchSend` 先 `onChange("")` 再 send（Composer.tsx:559-565），发送被拒（未安装/队列满等）时输入已丢。改为 send 成功后再清空，或失败路径恢复草稿（队列满已还文本，但 blocked toast 路径没有）。

**23. 新会话空态补引导**：doctor 正常且有项目时 `EmptyState` 渲染 null（EmptyState.tsx:36-37）+ `emptyTitle=""`（App.tsx:974），线程区只剩输入框；分屏更惨——渲染空 `<p>`（Thread.tsx:723-728）。提供快捷开始（最近项目、上次 prompt、示例任务）。

**24. Plan reject 反馈通道 + planComplete 去脆弱化**：reject 仅本地 toast（App.tsx:1162），agent 不知道被拒；planComplete 完全依赖本地 plan 数组，CLI 不推 plan 更新时永不触发。reject 时把「拒绝 + 可选意见」作为消息发回；planComplete 增加「手动标记完成」兜底入口。

**25. busy 时模式切换排队生效**：现在只 toast「下一轮生效」（useSlashCommands.ts:97-128）。把目标模式记为 pendingMode，turn 结束自动应用并在芯片上显示「已排队：plan」。

**26. QuestionCard 自由文本回答**：提问复用权限通道但没有文字回答通道（无 followup/request_input 协议）。加「自定义回答…」输入项，提交时以所选 option 文本 + 附加文本回发。

**27. stderr 过滤兼容非英文报错**：`surfaceStderr` 白名单全英文关键词（text.ts:107-121），中文报错不上屏。策略反转：除已知噪音行外全部上屏（分级 ERROR/WARN），保持 140 字符截断与去重。

**28. 失败回合一键重试**：失败以 tool/failed 项呈现（withPromptFail），无重试按钮。在失败卡片加「重试」（重发原文本）与「转草稿」。

**29. 输入历史（↑）**：Composer 无任何 prompt history 代码。空输入框按 ↑ 取上一条已发送 prompt（会话内，cap 50，内存即可），与 QueueStrip 的 Alt+↑↑ 重排不冲突。

**30. 声音提示（可选开关）**：完全无声音代码。加完成/需确认两枚极短提示音，默认关，设置页开关；与「仅未聚焦时提示」策略复用 `shouldNotify`。

**31. 修 dock 徽标计数**：`badgeCount`（notify.ts:86-88）与 `attentionCount`（session-status.ts:113-116）均无调用方（死代码），且语义是把全部历史 error 都算进徽标。接线为「needs-you + 未查看 error」实时计数，打开会话/全部已读后归零。

**32. i18n 还债：lib 层 150+ 条硬编码中文**：run-status.ts:4、session-status.ts:50-56、stall.ts:34-36、commands.ts:47-77、sidebar-list.ts:222-299、tool-render.ts:7-12、work-run-copy.ts、agent-doctor.ts:50-51 等约 30 个文件。这些是纯函数层，改为接收 `t` 或返回 key 由组件层翻译；加一条 CI 检查防止新增硬编码（扫描中文字符所在文件白名单）。

**33. 应用内 compact 入口与预警**：`/compact` 只是透传（commands.ts:48），达到阈值只有环变色。UsageRing ≥ compactPercent 时变色 + 点击弹「立即压缩」确认（发 `/compact`）；auto_compact 事件已有时间线项，补一个「已自动压缩」toast。

**34. 线程内 per-item agent 归属**：ChatItem 不携带 agentId，多 agent 并行时「谁在说话」只能靠 pane 隔离与 toast 前缀。至少给 tool/failed/compact 项标注来源 agent 小徽标（数据在事件 envelope 里有，折进 ChatItem 即可），为未来跨 agent 统一时间线铺路。

### P2（16 条）

**35. echoedUser 复位时机收紧**：置 true 后直到换会话/heal 才复位（useAcpSession.ts:503,684,1036,1153），期间所有 live user chunk 被丢。按 turn 边界（turn_completed/清 busy）复位，防多轮会话漏显 agent 侧 user 回显。

**36. 隐藏窗口时流式不丢不积**：rAF 在窗口隐藏时不触发，pendingByPane 无上限（useAcpSession.ts:628-654）。加 500ms setInterval 兜底 flush + 桶上限（超限合并为「…N 条更新」摘要），visibilitychange 恢复时立即 drain。

**37. applyChatUpdate 索引化**：每条 update 全量 `[...items]` + `findIndex` 按 toolCallId 查找（chat.ts:398,440），长会话 O(batch×items)。维护 toolCallId→index 映射，配合不可变更新只在尾项追加时复用数组尾部。

**38. settle/ghost tick 降本**：1s tick 每秒遍历全部 extra pane 的 items（useAcpSession.ts:542-557）。仅扫 busy pane；活动指纹（stall.ts:43-49）改为在 chunk 落地时打点而非轮询比对。

**39. ExtensionHub 加载骨架**：`load()` 串行多段 IPC 期间只有 busy 布尔（ExtensionsHub.tsx:161-201）。加 Skeleton + 并行化（Promise.all）+ 失败分区重试。

**40. UserTurn 编辑体验**：编辑态不支持 Escape 取消（UserTurn.tsx:49-84）；编辑重发会截断后续消息但无确认提示。加 Escape 取消 + 首次重发前确认弹窗（说明会丢弃其后的消息）。

**41. 输入区小体验包**：① MentionMenu 静默截断 12 条（MentionMenu.tsx:52）→ 尾部加「还有 N 条，继续输入过滤」；② 附件 ingest 异步无 pending 态（Composer.tsx:275-297）→ 附件条加转圈占位；③ 排队项编辑仅双击可发现（QueueStrip.tsx:84-95）→ 加显式编辑铅笔钮。

**42. 设置页模型名校验**：模型名自由文本 onBlur 提交无校验（Settings.tsx:809-815），拼错要到下次请求才失败。接入 `read_models_cache` 做下拉/自动补全 + 未知名黄条警示。

**43. PreviewPane Escape 语义收窄**：焦点在 pane 内按 Escape 直接关整个预览（PreviewPane.tsx:163-170）。优先级：关闭查找 → 关 tab → 最后才关预览。

**44. 无障碍批次**：Fold 折叠钮缺 `aria-expanded`（Thread.tsx:160-167）；UsageRing tooltip 仅 hover（UsageRing.tsx:25-44）补 focus-visible；SessionMenu/chip-menu/AppModal 无 focus trap 与初始焦点（对比 CommandPalette 有 trapFocus）——复用 `trap-focus.ts` 统一接入；关闭后焦点归还触发钮。

**45. 死代码清理 + FSM 收口**：`host-session-fsm.ts` 是完整纯 FSM 但主流程用 6 个 ref + 六处清 busy 分支（死代码两套模型并存）——要么接线为 busy 唯一事实源，要么删除；`agent_manifest.rs` 全文死代码；`applyLiveParentExpand` no-op（live-roster.ts:99-105）；`perm.timeout` 死文案（i18n.ts:176,886）；`workspace-hint` 监听无发射方（api.ts:369-370）；`onAcpRequest` 旧接口（api.ts:428）。

**46. 测试策略升级**：8 个测试直接正则读组件/CSS 源码断言（csp、ci-gates、composer-attach、frost-wiring、live-region、notify、round3-lock、ui-chrome）——改注释假红改实现假绿（oss-readiness T5 已点名）。替换为行为测试；引入 ESLint + `cargo clippy -D warnings`（T4）；组件测试从零起步（先覆盖 PermissionCard/QueueStrip/Composer 键盘路径）。

**47. Windows 跨平台真实性**：PATH 按 `:` 切分、依赖 `$HOME`（lib.rs:358、agent_host.rs:68,86）、`open_in_terminal` 硬编码 macOS Terminal.app（cli_bridge.rs:1376）——CI 矩阵里 win/linux 目前 allow-fail。用 `std::path::MAIN_SEPARATOR` / `dirs` crate / `#[cfg]` 门控，至少保证不 panic。

**48. 退出清理 + mock 横幅**：无 `RunEvent::Exit` 钩子主动回收 ACP 子进程（强杀时靠 stdin EOF 自杀，Windows 无进程树回收）——补退出钩子逐个 `start_kill`；`GROK_BUILD_ACP=mock` 静默替换真实 agent（lib.rs:677）——激活时在标题/侧栏挂可见的 MOCK 徽标。

**49. 安全杂项收口**：`open_path` 接受任意 http(s) 无确认（lib.rs:2557-2589）→ 外链加确认或白名单；`search_session_text`/`list_imagine_artifacts` 读 `~/Downloads` 全盘文件名（lib.rs:2317、cli_bridge.rs:1330-1368）→ 收窄到会话相关目录；`move_session_to_cwd`/`ensure_inbox` 允许任意目录（lib.rs:1728-1741）→ 限定已添加项目内。

**50. OSS 元数据与版本叙事**：`package.json`/`Cargo.toml` 至今无 `license`/`repository` 字段，包名仍叫 `grok-build-webui`、Cargo description 仍 "WebUI desktop client"（与产品定位矛盾，T3）；CHANGELOG 缺 0.4.1/0.5.0/0.5.1/0.6.0 段落。补字段、安排 crate 改名独立 PR（需全量回归）、CHANGELOG 回填。

---

## 第六部分 · 落地节奏建议

1. **第一批（P0 快赢，~1 周）**：#1/#8/#11（Rust 健壮性，互相独立可并行）、#6（通知深链，一行接线）、#22（发送回滚）。这批全是小改动大风险消除。
2. **第二批（体感黑洞，1-2 周）**：#9/#10（流式性能）+ #4/#5（挂死恢复与崩溃分类）——做之前先给 ghost-heal 语义反转补一个覆盖「已发出但挂死」的集成测试，避免回归。
3. **第三批（交互债，按域分）**：权限域 #12、分屏域 #13/#14/#15、键盘域 #16-#19 各开一条分支；i18n #32 单独开分支机械替换。
4. **持续**：P2 按 touches 的文件顺路带走（如改 Thread.tsx 时顺手 #44 的 Fold aria、#38 的 tick 范围）。
5. **守护**：每批落地后在 CI 增加 `npm run build` + clippy 门槛（与 #46 合并做），防止 audit-stability-ux B0 的「52 个类型错误被测试全绿掩盖」重演。

---

## 附：本次核实记录

以下 P0 结论在撰写前已回读源码确认：`acp_loop.rs:48`（truncate）、`lib.rs:2695` / `mcp_toml.rs:7` / `cli_bridge.rs:1291`（expect panic）、`api.ts:341`（setNotifyTarget 无调用方）、`lib.rs:528-549`（doctor 无超时）、`cli_bridge.rs:1704`（全文 read_to_string）、`tauri.conf.json:26`（connect-src https: 通配）。一处修正：`onEditQueued` 在主窗格已接线（App.tsx:1076），缺口仅存在于分屏（并入 #13）。
