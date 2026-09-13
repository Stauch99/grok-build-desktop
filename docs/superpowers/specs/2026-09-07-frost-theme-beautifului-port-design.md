# Frost 主题 + 全局动效升级 —— beautifului.dev 设计语言移植方案

- 日期：2026-09-07
- 状态：待审阅
- 分支基线：`feat/multi-agent-workbench`
- 参照对象：https://www.beautifului.dev/ （Turbo 出品的 AI-native 界面原语展示库，21 个原语）

---

## 0. 背景与前提结论

beautifului.dev **不是可安装的组件库**：无 GitHub repo、无 npm 包、无源码下载渠道（"copy-paste ready" 指邮件订阅推送）。其站点技术栈为 Next.js + Tailwind CSS v4，与本项目（Tauri + React 19 + 纯手写 CSS + tokens 体系，无 Tailwind）不兼容。

因此本方案**不引入任何外部依赖、不抓取其站点 JS/CSS 产物**，而是：

1. 将其公开页面的**设计令牌值**（oklch 配色，light/dark 双套，已从站点样式表提取核实）映射进我们现有 token 体系，形成第四主题族 **frost**；
2. 将其**结构视觉模式**（虚线分隔、描边阴影、胶囊控件、紧凑辅助字）以主题作用域覆盖实现；
3. 将其**动效与交互模式**（shimmer、可展开轨迹、滑动悬停、流式光标等）作为全局升级写入现有组件 CSS，四个主题通用。

## 1. 已确认的决策

| # | 决策点 | 选择 |
|---|--------|------|
| D1 | 视觉基底换血范围 | **C 双主题**：现有风格保留，beautifului 风格做成可切换主题族 |
| D2 | 动效归属 | **A 全局升级**：动效应用到所有主题，只有纯视觉 token 随主题切换 |
| D3 | 无对应原语处理 | **B**：仅新建 Selection Actions；Fine-tune Card、Agent Screen 跳过 |
| D4 | 实现路线 | **方案一**：主题族扩展 + frost.css 结构层 + 动效写入现有 CSS；不引入 Tailwind |

## 2. 架构总览

```text
三层结构，职责严格分离：

① 颜色层  src/styles/tokens.css        新增 frost 主题族令牌（light + dark 两块）
② 结构层  src/styles/frost.css         新文件；全部限定 :root[data-theme-family="frost"] 作用域
③ 动效层  src/styles/thread.css 等     写入各组件现有 CSS；只消费 token，主题无关

新组件    src/components/SelectionActions.tsx + 配套 hook
接入点    Settings.tsx（类型+下拉+i18n）、样式引入处、合法值校验处
```

现有机制链路（零架构变更）：

```
Settings 下拉 → setThemeFamily + persist → useAppModelEffects.ts:152
→ document.documentElement.dataset.themeFamily → CSS :root[data-theme-family=...] 生效
```

frost 即 `themeFamily` 的第四个合法值（`"default" | "paper" | "ink" | "frost"`），与 `data-theme="dark"`、`data-density="compact"` 正交组合。

## 3. 颜色层：frost token 映射表

beautifului.dev 令牌体系极简（约 10 个语义令牌），映射到我们现有 111 个 token 中的核心子集；缺口令牌按同色相区间推导补齐，保持 oklch 一致性。

### 3.1 Light（`:root[data-theme-family="frost"]`）

| 我们的 token | frost 值（源自站点提取） | 对应其令牌 |
|---|---|---|
| `--bg` | `oklch(98.5% .001 286.376)` | `--page` |
| `--bg-side` | `oklch(96.8% .001 286)`（推导） | — |
| `--bg-card` | `oklch(100% 0 0)` | `--surface` |
| `--bg-alt` | `oklch(96.1% .001 286.375)` | `--field` |
| `--bg-input` | `oklch(96.1% .001 286.375)` | `--field` |
| `--bg-hover` | `oklch(24.7% .006 258 / 4%)` | — |
| `--bg-active` | `oklch(24.7% .006 258 / 8%)` | — |
| `--line` | `oklch(94.6% .003 264.542)` | `--line` |
| `--line-strong` | `oklch(24.7% .006 258 / 10%)`（推导） | — |
| `--text` | `oklch(24.7% .006 258.361)` | `--ink` |
| `--muted` | `oklch(50.6% .01 264.477)` | `--ink-2` |
| `--faint` | `oklch(54.1% .01 264.484)` | `--ink-3` |
| `--accent` | `oklch(62.6% .205 254.947)` | `--accent` |
| `--accent-deep` | `oklch(55.6% .187 255.617)` | `--accent-ink` |
| `--cta` | `oklch(24.7% .006 258)` | — |
| `--cta-text` | `oklch(98.5% .001 286)` | — |
| `--ok` | `oklch(55% .12 155)`（推导，同其冷调） | — |
| `--warn` | `oklch(80% .13 85)`（推导） | — |
| `--danger` | `oklch(58% .19 25)`（推导） | — |
| `--shadow` | `0 0 0 1px var(--line)`（描边代阴影） | 其 `shadow-btn` 模式 |
| `--shadow-l` | `0 0 0 1px var(--line), 0 14px 44px oklch(24.7% .006 258 / 10%)` | — |

### 3.2 Dark（`:root[data-theme="dark"][data-theme-family="frost"]`）

| 我们的 token | frost dark 值 | 对应其令牌 |
|---|---|---|
| `--bg` | `oklch(20.9% .004 264.477)` | `--page` |
| `--bg-card` | `oklch(26% .006 271.191)` | `--surface` |
| `--bg-alt` / `--bg-input` | `oklch(29.3% .006 271.223)` | `--field` |
| `--line` | `oklch(30.8% .006 258.354)` | `--line` |
| `--text` | `oklch(96.4% .002 247.839)` | `--ink` |
| `--muted` | `oklch(73.1% .008 260.731)` | `--ink-2` |
| `--faint` | `oklch(69.5% .009 264.505)` | `--ink-3` |
| `--accent` | `oklch(68% .173 253.301)` | `--accent` |
| `--accent-deep` | `oklch(78.8% .113 248.33)` | `--accent-ink` |

> 其余 token（`--code-*`、`--usage-*`、滚动条等）在 frost 块内只覆盖确实需要变值的项，未覆盖者自动继承 `:root` 默认——与 paper/ink 主题族的现行做法一致。

## 4. 结构层：frost.css 覆盖清单

新文件 `src/styles/frost.css`（预估 300–500 行），**每条规则都必须以 `:root[data-theme-family="frost"]` 开头**，保证零泄漏。覆盖项：

| 视觉模式 | 应用位置 | 实现 |
|---|---|---|
| 虚线分隔 | Sidebar 区块间、Thread 日期间隔、Settings 分组、Composer 附件条 | `border-style: dashed`（沿用现有 1px `var(--line)`） |
| 描边代替重阴影 | 卡片、浮层、面板 | `box-shadow: 0 0 0 1px var(--line)`，替换 `var(--shadow)` 的重投影观感 |
| 胶囊形控件 | toggle、status chips、model picker、filter chips | `border-radius: 999px` + `--bg-alt` 底 + 内嵌滑块描边 |
| 紧凑辅助字 | 侧栏 label、chips 文字、表格辅助列 | 11.5px / `letter-spacing: 0.01em` / `var(--faint)` |
| 圆角收敛 | 全局 | frost 下 `--radius` 系列小幅下调（8→6、12→10、16→14），贴近其更克制的圆角 |
| 点状画布 | MermaidBlock 容器、空状态背景 | `background-image: radial-gradient(var(--line) 1px, transparent 1px)` + `background-size: 16px 16px` |

## 5. 动效层：全局升级清单（主题无关，21 原语映射）

写入各组件**现有** CSS 文件。约束：只用 compositor 友好属性（`transform` / `opacity`，展开类允许 `grid-template-rows: 0fr→1fr` 技法）；一律走现有 `--dur*` / `--ease*` 令牌；全部包进 `@media (prefers-reduced-motion: no-preference)` 或提供 reduce 降级。

### 5.1 对话主链路（thread.css / 相关组件）

| 原语 | 我们的组件 | 动效/交互改动 |
|---|---|---|
| Thinking（可展开轨迹） | `Thread`、`WorkTimeline` | 推理块可折叠展开（`grid-rows 0fr→1fr` + 内容 fade/slide）；chevron 旋转过渡；步骤按类型（reasoning/search/coding）配 icon |
| Streaming Text | `Thread`、`Markdown` | 流式输出末端块状光标（opacity 步进闪烁，流结束即移除）；完成后 action 行 fade-in-up；内联来源 chip 入场 stagger |
| Chat | `Thread` | 新消息入场 rise-in（现有 `rise-in` 关键帧复用，统一节奏） |
| Approval Card | `PermissionCard`、`QuestionCard`、`PendingRequestCard` | 入场 rise-in + 1px accent 描边环；批准/拒绝按钮改胶囊形（全主题）；决策后卡片 collapse-fade 退场 |
| Tool Chips | `AgentChip`、`BashCommandRow`、`ToolResult` | 紧凑 chip：icon + label + 状态点；running 态状态点 pulse（opacity）；hover 展开详情（translateY + fade） |
| Code Block | `Markdown` 代码块、`highlight.ts` 输出容器 | 行号列（frost 下点状分隔）；copy 按钮 hover 显现（opacity）；diff 着色统一走 token |

### 5.2 任务与运行状态（workspace.css / extras.css）

| 原语 | 我们的组件 | 动效/交互改动 |
|---|---|---|
| Loading State | `Skeleton`、`DotMatrix`、`RunStatusRegion` | Skeleton 加 shimmer 扫光（伪元素 `translateX` 扫过，非 background-position）；DotMatrix 像素格加波浪式 opacity 呼吸 + 已耗时读数样式 |
| Task Rows | `WorkRun`、`RunCockpit`、`ParallelSubagents` | running/failed/completed 三态：状态点色 + running 行左侧进度条（scaleX 循环）；行展开折叠同 Thinking 技法 |
| Recommendation Card | `RecapCard`、`PlanCompleteCard` | 置信度/进度 meter（scaleX 过渡）；action 按钮 hover 抬升 1px |
| Insight Cards | `DashboardPanel`、`TokenChart`、`UsageRing` | 卡片分页指示点；chart hover scrub 十字线（opacity）；数字滚动用现有机制不重造 |
| Diff Table | `DiffView`、`DiffSummary` | 增删行走 `--ok`/`--danger` 淡化底；summary chips 入场 stagger |
| Flowchart | `MermaidBlock` | 容器点状画布（frost 结构层）；渲染完成 fade-in |

### 5.3 导航与输入（sidebar.css / composer.css / palette.css）

| 原语 | 我们的组件 | 动效/交互改动 |
|---|---|---|
| Sidebar Nav | `Sidebar` | **滑动悬停**：共享 hover 指示层在条目间 `translateY` 滑行（单个绝对定位元素 + transform，监听 active item 位置）；分组折叠 chevron 旋转 |
| Search | `CommandPalette` | 空状态（插画 + 文案）fade-in；结果行 hover 滑入指示条；kbd 提示样式统一 |
| Prompt Bar | `Composer`、`ComposerChips`、`MentionMenu`、`SlashMenu` | focus 时 1px accent 描边环过渡；附件/上下文 chips slide-in；model picker 胶囊化；mention/slash 菜单 rise-in 统一 |
| Context Cards | `ContextPanel` | 卡片 hover 抬升（translateY(-1px) + 描边加深）；来源行紧凑辅助字 |
| Records/Filter Table | `ShortcutsTable`、`FileListRow`、`GitHistory` | 表头排序 affordance（hover 显现箭头）；tag chips 胶囊化；filter 行 chip 选中态滑块过渡 |

## 6. 新组件：Selection Actions

**需求**（对应其 "Selection Actions — Highlight a passage and hand it to the agent to rewrite"）：在 Thread 的助手消息中划选文本 → 浮出工具条 → 「改写」将选段引用 + 改写指令预填进 Composer。

### 6.1 设计

```text
src/components/SelectionActions.tsx     浮动工具条组件（改写 / 引用 / 复制）
src/hooks/useTextSelection.ts           选区监听 hook（selectionchange + 边界判定）
src/lib/selection-actions.ts            纯逻辑：选区→锚点坐标、引用文本格式化（可单测）
src/styles/thread.css                   工具条样式追加（或独立 selection.css，视行数）
```

- **触发**：`mouseup`/`selectionchange` 后，选区非空且完整落在助手消息 DOM（`[data-msg-role="assistant"]`）内才显示；跨消息或用户消息选区不触发
- **定位**：`Range.getBoundingClientRect()` + 容器相对坐标，工具条置于选区上方，越界翻转下方；纯 `transform` 定位
- **动作**：
  - 改写 → Composer 预填 `> 选中片段引用\n\n改写：`，焦点入 Composer，用户补充指令后发送
  - 引用 → 仅将选段以 blockquote 预填进 Composer
  - 复制 → `navigator.clipboard` + toast（走现有 `useToast`）
- **消失**：点击空白、选区清空、滚动、Escape
- **a11y**：工具条 `role="toolbar"`，按钮可 Tab 聚焦；纯键盘用户通过现有复制路径不受损；`prefers-reduced-motion` 下无入场动画

### 6.2 边界

- 不处理触屏长按（桌面应用，YAGNI）
- 不做多语言改写指令模板扩展（首版固定文案，走现有 i18n 表）

## 7. 明确不做（Out of Scope）

1. **Fine-tune Card、Agent Screen**：无对应产品场景（决策 D3）
2. **引入 Tailwind / 任何新运行时依赖**：与现有纯 CSS 架构冲突（决策 D4）
3. **抓取复制 beautifului.dev 站点的 JS/CSS 产物**：站点虽标 MIT 但未发布源码，直接扒产物属灰色地带；本方案只使用其**设计令牌值**（事实性数据）与**视觉模式描述**（风格不受版权保护），全部代码自行实现
4. **替换默认主题**：frost 是可选项，default/paper/ink 现状不动
5. **重构现有组件结构**：动效升级只动 CSS 与最小组件标记（如加 wrapper/pseudo 锚点），不改组件职责与 props 契约

## 8. 测试策略

| 层 | 内容 | 工具 |
|---|---|---|
| 单元 | `selection-actions.ts` 纯逻辑（选区判定、引用格式化、越界翻转）；themeFamily 合法值校验含 frost；token 推导值快照 | vitest（沿用现有密集测试文化） |
| 视觉回归 | Playwright 截图：1024 / 1440 两档桌面宽度 × {light, dark} × {default, frost} 四组合；覆盖 Sidebar、Thread（含流式/Thinking/Approval 态）、Composer、CommandPalette、WorkRun | 现有 `playwright.config.ts` + `e2e/` |
| 动效验证 | shimmer / glide / 展开动画的 reduced-motion 降级断言（动画时长为 0 或 display 切换） | Playwright `prefers-reduced-motion: reduce` 上下文 |
| a11y | SelectionActions toolbar 键盘可达；frost 主题下文本对比度 ≥ WCAG AA（oklch 值换算校验，`--faint` 是风险点） | Playwright + 对比度脚本 |
| 回归 | 现有全部 vitest 套件保持绿色；`.tmp-ui-review` 既有 UI 审查流程复跑 | `npm test` |

## 9. 交付顺序（5 个 Phase，每个独立可合并）

| Phase | 内容 | 涉及文件 | 验收 |
|---|---|---|---|
| **P0 颜色层** | frost token 两块 + Settings 接入（类型/下拉/i18n）+ 校验白名单 | `tokens.css`、`Settings.tsx:71`（类型+下拉）、`api.ts:60`（类型）、`useWebuiPersist.ts:32`（类型）、`hydrate-webui.ts:156`（白名单加 `"frost"`）、i18n 表 | 切到 frost 全站无样式崩坏，light/dark 均正常；刷新后持久化生效 |
| **P1 结构层** | `frost.css` 全量覆盖（虚线/描边/胶囊/紧凑字/点状画布） | `frost.css`（新）、样式引入处 | 视觉回归截图对照 beautifului.dev 各原语逐项核对 |
| **P2 动效·对话链路** | §5.1 全部（Thinking/Streaming/Approval/Tool Chips/Code Block） | `thread.css`、`composer.css` 及对应组件最小标记改动 | 动效在四主题下正常；reduced-motion 降级生效 |
| **P3 动效·状态与导航** | §5.2 + §5.3 全部 | `workspace.css`、`sidebar.css`、`palette.css`、`extras.css` 等 | 同上；Sidebar glide 无布局抖动（CLS≈0） |
| **P4 Selection Actions** | §6 新组件 + hook + 纯逻辑 + 测试 | 4 个新文件 + `Thread.tsx` 挂载点 | 单测绿 + E2E：划选→改写→Composer 预填全链路 |

> P2/P3 若并行开发需协调共享文件（thread.css 等），建议串行或按文件域拆分分支。

## 10. 风险与对策

| 风险 | 等级 | 对策 |
|---|---|---|
| oklch 在旧 WebView 不支持 | 低 | Tauri 使用系统 WebView（macOS WKWebView ≥ 15.4 支持 oklch）；仍为 `--faint` 等推导值准备 hsl 回退声明 |
| frost 下对比度不足（`--faint` 54.1% 亮度用于小字） | 中 | P0 阶段即跑对比度校验，不达标则调暗/调亮该 token，不照抄原值 |
| Sidebar glide 指示层与虚拟滚动/折叠动画冲突 | 中 | 指示层用 rAF 读取目标位置，折叠期间禁用滑行（直接瞬移） |
| shimmer 伪元素在 `overflow: hidden` 容器外泄漏 | 低 | 统一 `contain: paint` 或父级 overflow 裁剪 |
| 动效改动触碰 ~90 个组件中的既有行为测试 | 中 | P2/P3 只增不改既有选择器语义；每 Phase 结束全量跑 vitest |
| 主题族组合爆炸（4 family × 2 theme × 2 density）截图成本 | 低 | 视觉回归只锁 {default, frost} × {light, dark}，density 抽测 compact 一档 |

## 11. 法务备注

- beautifului.dev 页面声明 MIT License（/license："Yes, you can use it for free"），但未提供源码分发渠道
- 本方案仅使用：① 从公开样式表提取的**颜色令牌数值**（事实性数据，不具独创性表达）；② 公开页面的**视觉风格与交互模式**（设计风格/思想层面，不受版权保护）；③ 其官网对每个原语的**功能描述文字**（仅作需求参照，不复制文案进代码库）
- 全部 CSS/TS 实现为本项目原创代码；不下载、不反编译、不复制其站点任何 JS/CSS 产物
