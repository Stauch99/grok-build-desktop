# 成长记忆 UI + 全 CLI 记忆 MCP 接入方案（v2）

> 日期：2026-09-08（v2 修订）· 分支：`feat/multi-agent-workbench` · 状态：M1–M4 已落地（本会话）
>
> **Goal:** 把现有「做梦记忆」升级为可视的成长档案页（参考 Kimi 成长记忆页，去头像、加 AI 定位语），把记忆存储以 **MCP server** 开放给所有 CLI agent，并重做整理频率与输入质量——**每次整理只花 1 个 LLM prompt、只喂加权精选语料**，触发条件为「每晚定时 OR 累计新会话达标」。
>
> **v2 修订记录**（吸收 2026-09-08 反馈）：
> 1. 头部去掉头像，改为一句 **AI 生成的定位语**；
> 2. 整理触发改为「每天晚上 OR 累计 N 个新对话」，并大幅降低单次额度消耗（3 prompt → 1 prompt）；
> 3. 整理时对历史对话核心内容（含用户输入）**按权重精选**后输入，而非全量灌入。

---

## 1. 现状盘点（本轮不重写，只长出来）

现有记忆系统已经有一套完整的文件契约与整理管线，本轮全部复用：

| 零件 | 位置 | 说明 |
|---|---|---|
| 存储根 | `~/.acp-workbench/memory/` | `memory_host.rs::memory_root()`，支持 `ACP_WORKBENCH_HOME` 覆盖 |
| 用户记忆 | `USER.md` | deep 阶段产物，注入 prompt 的正文 |
| 成长日志 | `DREAMS.md` | `## YYYY-MM-DD` 段落 = 日记条目（`memory-view.ts::parseDreamsMd`） |
| 每日暂存 | `daily/YYYY-MM-DD.md` | tagged line：`- [agent \| session \| cwd \| kind] text`，kind ∈ `user_pref / user_utterance / agent_commitment` |
| 状态 | `.dreams/state.json` | cursors、forgotten、lockOwner、lastDeepAt 等（`memory-state.ts`） |
| 整理任务 | `useDreamJob.ts` + `memory-dream.ts` | light/rem/deep 三相，经 ACP 驱动 dream agent |
| 语料摄取 | `memory-ingest.ts` / `memory-grok-turns.ts` | 从 session updates 拉增量，过滤 secret / tool 行 —— **本地操作，不耗额度** |
| 晋升门槛 | `memory-score.ts` | score ≥ 0.7 且 ≥3 session 且 ≥3 agent·cwd 对 |
| 注入 | `memory-inject.ts` | 首条 prompt 包 `<user-memory>`，`compactUserMd` 上限 4000 字符 |
| GUI | `ExtraOverlay` 的 `memory` 页 → `MemoryWorkspace` | 日记 pane + MEMORY.md/AGENTS.md 行 |

### 1.1 现状澄清：额度到底花在哪（v2 补充）

- **每次对话**：只做本地暂存（daily 行 + cursors 推进），零额度。
- **整理 sweep**（烧额度的部分）：触发点是 ① 凌晨 3 点定时（`memory-schedule.ts`）、② **每天首次打开 app 的补偿**（`shouldCatchUp`：lastDeepAt 不是今天 + 有 ≥1 个新会话 + 距上次 ≥20h，`memory-gates.ts`）、③ 手动。一次 sweep = light / rem / deep **三次 LLM prompt**（`memory-phase-prompt.ts`），且每次都全量携带当日 daily 文件 + USER.md / DREAMS.md。
- 所以问题不是「每对话跑一次」，而是 **「每天至少一次 × 3 prompt × 全量上下文」**。v2 的目标：频率可控（晚间 + 累计阈值），单次成本 3 prompt → 1 prompt，上下文全量 → 加权精选。

**硬约束（现有测试锁死，不得破坏）：**
- 单文件 64 KiB cap；路径逃逸防护；永不创建/改写 `MEMORY.md`（`memory_host.rs::resolve_under`）。
- daily 行格式 locked；secret 行不落盘（`looksLikeSecret`）。
- dream sweep 互斥靠 `state.json.lockOwner`；cursors 语义不变。

## 2. 需求分析

### 2.1 需求 A：成长记忆 UI（截图拆解 + v2 修订）

1. **头部（v2 修订：无头像）**：「{用户} 的工作台」标题 + **AI 定位语**（一句话总结产品给用户的定位，随整理顺带生成，近乎免费）+ 一句统计叙事（陪伴 N 天 · 共 M 次会话 · 连续 K 天）+ `···` 菜单。
2. **双指标切换**：`亲密度 / 成长度` 分段控件，各自配一句说明文案。
3. **热力图**：GitHub 贡献图风格，近 12 个月，周列 × 7 行，5 档强度，月份刻度。
4. **成长日志卡片**：左纸张质感日记页（衬线、日期、正文），右时间线（日期节点 + 事件项「新增 N 条记忆 / 整理了用户记忆 / 写日志 / 开启自我学习」），点击日期节点切换左侧页。
5. **空态**：新装用户全灰热力图 + 引导文案 + 「立即整理」。
6. **菜单能力**：立即整理并更新定位语、打开原始文件、记忆 MCP 接入管理。

### 2.2 需求 B：记忆能力经 MCP 开放给所有 CLI

- **对象**：GUI 内四个受管 CLI（grok / kimi / claude / codex）自动注册；**其它任何支持 MCP 的 CLI** 靠通用配置片段接入——server 必须独立于 GUI 进程可用。
- **能力边界**：CLI 拿到的是「读记忆 + 写暂存」；**晋升进 USER.md 仍由 GUI 的 dream 独占**（多写者只在 daily 暂存层）。
- **显形**：CLI 经 `memory_append` 写入的行，计入热力图、时间线与「累计新对话」阈值。

### 2.3 需求 C：频率与成本治理（v2 新增，核心）

- **触发**：每晚定时一次 OR 白天累计新对话达标才跑一次——用户原话「每天晚上，或累计完成多少个对话才自动执行一次」。
- **单次成本**：一次整理只允许 **1 个 LLM prompt**。
- **输入质量**：把历史对话核心内容（含用户输入）**按权重精选**后输入，带字符预算，不做全量灌入。

### 2.4 明确不做（本轮）

- 向量/嵌入检索（v1 用词元 + 权重打分）；HTTP/SSE 远程 server（v1 仅 stdio）；改存储格式与注入机制；接入 GUI 之外的 scheduler；头像/账号体系。

## 3. 总体架构

```
                    ┌──────────────────────────── GUI (Tauri) ─────────────────────────┐
                    │  MemoryGrowthPage（新 UI）     useDreamJob（唯一 USER.md 写者）    │
                    │        ▲  invoke                      │  整理 = 1 prompt（v2）    │
                    │        │                              ▼  触发 = 晚间 OR 累计N     │
                    │  memory_activity / memory_events ┻→ ~/.acp-workbench/memory/      │
                    │                                    USER.md · DREAMS.md           │
                    │                                    daily/*.md · .dreams/state.json│
                    │                                    .dreams/events.jsonl（新）     │
                    └──────────────┬───────────────────────────▲───────────────────────└──────────
          注册：写入 4 个 CLI 的    │                           │ stdio（flock 防交错）
          live MCP 配置（复用      ▼                           │
          mcp-sync 管线）   ~/.grok/config.toml 等       memory-mcp（新 sidecar 二进制）
                            ~/.kimi-code/mcp.json            MCP tools: recall/get/
                            ~/.claude.json                   append/timeline/forget
                            ~/.codex/config.toml             （任意 MCP CLI 均可配置）
```

**关键决策 1 —— server 形态：独立 sidecar 二进制（stdio），不是 GUI 内嵌 HTTP。**
理由：CLI 常在终端独立启动，GUI 不一定开着；stdio 无网络攻击面；文件存储天然支持多进程（flock）；打包走 `tauri.conf.json externalBin`，运行时解析自身绝对路径写进各 CLI 配置（app 每次启动同步，幂等自愈）。

**关键决策 2 —— 分层写权限：sidecar 只 append `daily/` 与 `events.jsonl`，绝不写 `USER.md` / `DREAMS.md`。**
晋升门槛、冲突策略（`shouldKeepExisting`）、lockOwner 语义原样保留；外部写入统一走暂存层。

**关键决策 3（v2）—— 整理从「三相三调用」改为「本地归并 + 单次主调用」。**
暂存归并本地做（免费）；一次主 prompt 同时产出 日记段落 + USER.md 重写 + 定位语。频率由门控（§5.1）控制，输入由加权选择器（§5.3）裁剪。

## 4. 数据层扩展

### 4.1 新增 `.dreams/events.jsonl`（append-only 事件流）

```json
{"at":1756905600000,"kind":"dream_sweep","agent":"grok","prompts":1,"inChars":8210,"outChars":1560,"count":3}
{"at":1756992000000,"kind":"promote","count":3}
{"at":1757078400000,"kind":"mcp_append","agent":"codex","count":5}
{"at":1757078400000,"kind":"session_new","agent":"claude"}
```

- `kind` 枚举：`dream_sweep | promote | mcp_append | memory_inject | session_new | dream_enable | mcp_register`。（v2：原 light/rem/deep 三事件合并为 `dream_sweep` 一条，附 `prompts/inChars/outChars`，给 UI 做成本可见。）
- 写入点：主调用完成处、晋升处、MCP append 成功处、session 扫描发现新会话处。
- 容量治理：> 1 MiB 时重写截断，保留最近 2000 行（Rust 端 append 前惰性检查）。

### 4.2 `state.json` 新增字段（向后兼容，`parseMemoryState` 放宽）

- `tagline: string | null` + `taglineAt: number | null` —— AI 定位语及其生成时间。
- `pendingSinceDeep: { sessions: number, mcpBatches: number } | null` —— 距上次整理累计的新材料计数（也可由 cursors/events 推导，落盘是防推导漂移；v2 先落盘）。
- `dailySeenDay: string | null` —— 已消费到的 daily 日期，用于跨天未晋升行的补选（§5.3）。

### 4.3 新增 Tauri 命令

- `memory_activity() -> { days: [{day, activity, memory}], companions_since, sessions_total, streak_days }`
  聚合 `daily/*.md` 行数 + events + session 扫描（复用 `session_scan.rs`）→ 热力图与统计行一次拿全。
- `memory_events(limit) -> Event[]`：解析 events.jsonl；时间线归并在 GUI 侧 `useMemoryGrowth` 做。
- 两者全部走 `resolve_under` 同款防护；只读。

### 4.4 指标定义

- **亲密度**（活动热力图）：当日 `daily 行数 + mcp_append 条数 + 新 session 数 ×2`，映射 0–4 档。
- **成长度**（记忆增长热力图）：当日 `promote 条数 + dream_sweep 的 USER.md 字节增量 / 512`，映射 0–4 档。
- **陪伴天数**：最早一份 daily 文件日期（缺省 = events 最早时间）至今天数。
- **聊了几次**：sessions 总数（现有 `listSessions` 聚合）。
- **连续天数**：亲密度连续非零天（从今天/昨天起算，容忍今天未开始）。

## 5. Dream 频率与成本治理（v2 新增核心节）

### 5.1 触发门控（改造 `memory-gates.ts`，保留 manual 旁路）

| 触发 | 条件 | 说明 |
|---|---|---|
| 每晚定时 | 03:00 本地时间 且 `pendingMaterial ≥ 1` | 现有 `armRecurringLocalHour` 不动，gates 增加「无新材料不跑」 |
| 累计达标（白天补偿） | `pendingMaterial ≥ N` 且 `now - lastDeepAt ≥ 4h` | **N 默认 8**（pendingMaterials = 有新行的 session 数 + mcp_append 批次数），`memory-settings` 新增 `dreamThresholdSessions`，设置 UI 提供滑杆 4–20 |
| 手动 | 仅受 lock 限制 | 永远可用 |

- 移除现有「每天首次打开 app 就补偿跑」的语义（`shouldCatchUp` 只用于判断「昨晚是否漏跑」，漏跑并入下一次触发，不单独触发）；保留 `DEEP_MIN_MS=20h` 仅对晚间触发生效，白天累计触发用 4h 最小间隔。
- 未达阈值时 **什么都不发生**（cursors 不动、不建 ACP 会话、零额度），材料继续在本地暂存，最多等 N 条或当晚。
- 新装用户首次：`lastDeepAt == null` 且材料 ≥ 1 时允许立即跑一次（现有语义保留），保证 UI 不空。

### 5.2 单次整理的执行计划（3 prompt → 1 prompt）

```
[本地，免费]  拉增量 pages → applyGrokIngest 合并进 daily（cursors 推进）
             （原 light 相的 LLM 润色调用删除：daily 是 locked 格式，模型无法也没必要重构）
[本地，免费]  加权精选（§5.3）→ 组装主 prompt
[1 次调用]   主 prompt → 按标记分段解析：
             <<<DIARY>>>…<<<USER>>>…<<<TAGLINE>>>
             DIARY 缺失 → 回退现有 appendDreamsAppendix 行为；
             USER 缺失/未变 → 保留现有 USER.md（applyUserMdRewrite 原语义）；
             TAGLINE 缺失 → 沿用旧 tagline
[本地，免费]  晋升计数、events 打点、persistIo
```

- `DreamPhase` 收敛为 `"gather" | "main"`；`memory-phase-prompt.ts` 重写为一个 `mainPrompt(io, selected, budget)`；`runDreamSweep` 的 phase 循环简化。
- 额度模型：输入 ≈ USER.md(≤4k chars) + 精选语料(≤6k chars) + DREAMS 尾部(≤2k chars) ≈ **≤12k chars（约 3–4k tokens）**，输出 ≤4k chars；对比 v1 的 3 次全量调用，单日额度降为约 1/3 且不再随 daily 增长而膨胀。

### 5.3 加权输入选择器（新 lib：`memory-weight.ts`，纯函数 + Vitest）

对 daily 候选行打分（复用 `memory-score.ts` 的跨会话概念）：

| 信号 | 权重 | 说明 |
|---|---|---|
| kind | `user_pref ×3`、`agent_commitment ×2`、`user_utterance ×1` | 偏好 > 承诺 > 一般发言 |
| 跨会话复现 | ≥2 个 session 出现相似内容 ×2 | 归一化后包含匹配（`shouldKeepExisting` 同款手法） |
| 显式记忆信号 | 命中 `记住/以后/总是/不要/喜欢/习惯/偏好`（zh）与 `remember/always/never/prefer/don't`（en）×2 | 用户点名要记的内容优先 |
| 新近度 | 当天 ×1.2，前一天 ×1.0，更早 ×0.8 | 轻量倾斜 |
| 长度 | >600 chars 的行截断到 600 参与打分与输入 | 暂存文件不动 |

- 选择：按分排序取 **top-K = 40 行 / ≤6000 字符预算**（常量导出，可调）；落选行保留在 daily 中，不晋升也不丢弃，`dailySeenDay` 之前的未入选行在下次 sweep 优先补选。
- 权重得分本身写入 events（`dream_sweep.selected` 摘要），便于在成长日志里解释「为什么记了这条」。

### 5.4 定位语（v2 新增）

- 生成：主调用的 `<<<TAGLINE>>>` 段，要求 ≤40 字、中文用户给中文；写入 `state.json.tagline`。
- 展示：头部标题下方一行；为空时用静态 i18n 兜底文案（如「越用越懂你的工作台记忆」）。
- 重新生成：`···` 菜单的「立即整理并更新定位语」触发 manual sweep，不单独发调用。

## 6. memory-mcp sidecar 设计

新 crate（`src-tauri/binaries/memory-mcp/`），用官方 `rmcp` SDK；若依赖体积不可接受，退化为手写 JSON-RPC 2.0 循环（仅 5 个工具，工作量可控）。

### 6.1 MCP 核心工具（5 个）

| Tool | 输入 | 行为 | 返回 |
|---|---|---|---|
| `memory_get` | — | 读 `USER.md`，过 `compactUserMd` 同款 4000 字符压缩 | `{ text, updated_at }` |
| `memory_recall` | `{ query, limit? }` | 词元打分搜 `USER.md` + `DREAMS.md` 段落 + 近 N 天 daily 行 | `[{ text, source, score }]` |
| `memory_append` | `{ lines: [{ text, kind }], agent }` | secret 过滤 → tagged line 格式化 → flock 下 append 今日 `daily/` → 记 `mcp_append` 事件并累加 `pendingMaterial` | `{ appended, day }` |
| `memory_timeline` | `{ limit? }` | events.jsonl + DREAMS.md 段落归并 | `[{ at, kind, label }]` |
| `memory_forget` | `{ session_id }` | 并入 `state.json.forgotten`（flock 下读改写） | `{ ok }` |

Resources（只读）：`memory://user.md`、`memory://dreams.md`。无 prompts（v1）。

`memory_append` 行格式与 `memory-ingest.ts::formatDailyFile` 完全一致；`agent` 映射到 `AgentId`，其它值记 `external`（仅展示标签放行，管线侧 `isAgentId` 不动）。

### 6.2 并发与安全

- 写互斥：`.dreams/memory.lock` 文件 flock（`fs2` crate，跨平台）。`state.json` 的 `lockOwner` 语义不变。
- `memory_append` 服务端强制：单行 ≤2000 字符、单次 ≤20 行、secret 正则与 `looksLikeSecret` 同款、64 KiB cap、绝不触碰 `MEMORY.md`。
- server 仅 stdio，无监听端口；路径解析复用 `ACP_WORKBENCH_HOME` 逻辑。
- 隐私总闸：设置里「允许 CLI 读写记忆」；关闭时 GUI 同步把注册从各 CLI 配置中移除。

### 6.3 注册与同步（复用现有 MCP 管线）

- catalog（`~/.agents/mcp.json`）加一条**内建 pinned server**：`name: "grok-build-memory"`，`transport: "stdio"`，`commandOrUrl: <sidecar 绝对路径>`（GUI 启动时自愈重写）。
- 复用 `mcp-sync-apply.ts` 四套 merge/remove 同步进 4 个 live 配置；ExtensionsHub 固定展示、不可删除，仅可 per-agent 启停（`SyncFlags`）。
- `agent_doctor` 新增检查项：memory sidecar 已注册、二进制存在且可执行。
- README / 设置页提供任意 MCP CLI 的通用配置片段。

## 7. UI 方案：MemoryGrowthPage

挂在 `ExtraOverlay` 现有 `page === "memory"`（替换 `MemoryWorkspace` 主体；原 MEMORY.md/AGENTS.md 行收进 `···` 菜单折叠区）。

```
┌──────────────────────────────────────────────────────────┐
│ 「Leslie 的工作台」                                  [···] │   ← 无头像（v2）
│ 越用越懂你的工作台 —— AI 定位语（随整理生成，可关闭）      │
│ 已陪伴 312 天 · 共 189 次会话 · 最近连续 12 天            │   ← 统计叙事（i18n 模板）
│ ┌─────────────┐                                          │
│ │ 亲密度 | 成长度 │  ← 分段控件                             │
│ └─────────────┘                                          │
│ 聊天或安排任务越多，亲密度越高                             │   ← 随 tab 切换文案
│ ░░░░░░░░░░░░░▁▂▃▅█ 53×7 热力图，5 档强度                  │   ← 纯 div + title tooltip
│ ┌──────────────────────────────────────────────────────┐ │
│ │ 成长日志        记录工作台每次记忆的变化               │ │
│ │ ┌──────────────┐  ● 2026-09-04                        │ │
│ │ │ 工作台的日志  │  │ ◦ 新增 3 条记忆（Codex）          │ │  ← 左纸张页 + 右时间线联动
│ │ │ 2026-08-30   │  ● 2026-09-01                        │ │
│ │ │ 正文……       │  │ ◦ 整理了记忆（1 次调用 · 8.2k 字） │ │  ← events 成本可见
│ │ └──────────────┘  ◦ …                                 │ │
│ └──────────────────────────────────────────────────────┘ │
└──────────────────────────────────────────────────────────┘
```

组件拆分（新目录 `src/components/memory-growth/`）：

- `MemoryGrowthPage.tsx` — 组装 + `···` 菜单（立即整理并更新定位语 / 打开 USER.md / DREAMS.md / 记忆 MCP 设置）。
- `GrowthHeader.tsx` — 标题 + **定位语**（`tagline` 空时用兜底文案）+ 统计叙事。
- `GrowthToggle.tsx` / `GrowthHeatmap.tsx` — 分段控件；53×7 div 热力图，`--heat-0..4` token，hover tooltip，月份标注。
- `GrowthTimeline.tsx` / `GrowthDiaryPaper.tsx` — 时间线（日期节点 + 事件 chips，含成本摘要）与纸张日记页联动；衬线用已有 `@fontsource/noto-serif-sc`。
- 数据 hook：`useMemoryGrowth.ts`（invoke 新命令 + 复用 `useDreamJob` 的 diary/status），加载态与空态（全灰热力图 + 引导 + 「立即整理」）。

主题/i18n：选择器走现有 token 体系，frost 覆盖以 `:root[data-theme-family="frost"]` 前缀追加；文案全部 `t(locale, "memory.growth.*")`，zh/en 成对。参考页只借布局语言，命名/文案全部用本项目自己的。

## 8. 里程碑（每步可独立合并，全程 `vitest` + `cargo test --lib` 绿）

### M1 频率、成本与数据层（Rust + 打点 + 门控）
- [x] events.jsonl 读写（append/截断/解析）+ `memory_activity` / `memory_events` 命令
- [x] `memory-gates.ts` v2：晚间无新材料不跑、累计阈值 N + 4h 间隔、移除首开必跑；`memory-settings` 增 `dreamThresholdSessions`（默认 8）+ 设置 UI 滑杆
- [x] `memory-weight.ts` 加权选择器 + `memory-dream.ts` 收敛为 gather+main 单调用 + `<<<DIARY/USER/TAGLINE>>>` 解析与回退
- [x] `useDreamJob` 打点（`dream_sweep` 含 prompts/inChars/outChars）、tagline 落 state.json
- [x] 单测：gates v2、权重排序/预算截断、分段解析回退、cap/escape/截断
- 验收：同一批材料只可能触发 1 次调用；未达阈值时零 ACP 会话创建

### M2 成长记忆 UI
- [x] `useMemoryGrowth` + 六组件（含定位语展示与兜底）+ 空态 + frost 覆盖 + i18n
- [x] `MemoryWorkspace` 收编进 `···` 菜单
- [x] Vitest：parse/归并/分档；Playwright：渲染、tab 切换、时间线联动
- 验收：§2.1 六要素齐备（无头像），frost 与默认主题均正常

### M3 memory-mcp sidecar
- [x] crate + 5 工具 + flock + secret/cap 防护 + 安装到 `~/.acp-workbench/bin`
- [x] 协议测试：initialize / tools/list / 各工具契约（超大、secret 拒绝、pendingMaterial 累加）
- 验收：真实 stdio client 连接读写成功；GUI 关闭时 CLI 侧可用

### M4 注册同步与设置
- [x] catalog pinned 内建项 + per-agent SyncFlags + 路径自愈重写
- [x] agent_doctor 检查项 + ExtensionsHub 展示 + 隐私总闸 + 通用接入文档
- 验收：勾选后四个 CLI 配置出现该 server，取消即移除；doctor 报绿

## 9. 测试与验收清单

- **契约测试**：daily tagged line 格式在 `memory-ingest.ts` 与 sidecar 两侧 byte-to-byte 一致；`compactUserMd` 与 sidecar `memory_get` 一致（共享 fixture 双端跑）。
- **成本回归**：模拟一天 30 个新会话 → 全天 sweep 次数 ≤ 1（晚间）+ 白天触发次数符合阈值公式；每次 sweep 恰好 1 个 prompt。
- **并发**：双进程同时 `memory_append` 100 行无交错/丢失（flock 测试）。
- **隐私**：secret 样本在 MCP 写入侧被拒；总闸关闭后 CLI 配置中 server 被移除。
- **回归**：现有 memory 系列测试全绿（`memory-gates` / `memory-phase-prompt` / `memory-dream` 系按 v2 语义同步重写）。

## 10. 风险与开放问题

| # | 问题 | 当前倾向 |
|---|---|---|
| 1 | 累计阈值 N 的默认值（8）是否合适 | 上线后看 events 分布再调；滑杆暴露给用户兜底 |
| 2 | 单调用三段输出（DIARY/USER/TAGLINE）解析失败率 | 分段标记 + 逐段回退，最坏情况退化为「只晋升 USER.md」= 现有 deep 语义；解析器单测覆盖裁断/缺段/乱序 |
| 3 | 权重信号的关键词表是启发式，可能漏 | 权重只决定「喂给模型的优先级」，未入选行不丢（下次补选），坏case是晚一两轮被记住 |
| 4 | 「成长度」分母（晋升条数 vs USER.md 字节增量） | events 同时记 count 与 bytes，M2 上线后看曲线可读性再定档 |
| 5 | 头部用户名来源 | 设置 optional display name，缺省「我的工作台」；不引入账号体系 |
| 6 | `external` agent 标签波及封闭枚举 | 仅展示层放行（`memory-view.ts` LABELS 加 external），`isAgentId` 不动 |
| 7 | rmcp 依赖体积 | 先试 rmcp；release 体积膨胀 >15% 则手写 JSON-RPC |
| 8 | Windows flock 与 sidecar 路径 | `fs2` 跨平台；executable_dir 拼接；CI 加 windows 冒烟 |
| 9 | 外部 CLI 直写 daily 的隐私边界 | v1 接受（与现状一致）；后续可加 pending 审批 chip（复用 `MemoryInjectChip` 形态） |
| 10 | 热力图对新用户全灰 | 空态引导 + 首次整理后即有亮点，可接受 |

---

**一句话总结**：存储、整理管线、MCP 同步管线全是现成的。v2 在其上新增：一条事件流（events.jsonl）+ 两个只读聚合命令（喂 UI）；把「做梦」收敛为 **门控触发（晚间 OR 累计 N 条）+ 本地归并 + 单次主调用（加权精选语料，顺带产出定位语）**；一个 stdio sidecar 开放给所有 CLI；一页成长档案 UI 把这一切显形。
