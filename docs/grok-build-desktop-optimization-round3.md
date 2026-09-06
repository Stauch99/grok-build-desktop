# Grok Build Desktop · 优化建议 第三轮（round 3）

> 版本：0.4.0 review · 日期：2026-08-31 · 分支：`feat/multi-agent-workbench`
> 前置：`docs/grok-build-desktop-optimization.md`（#1–100）、`docs/grok-build-desktop-optimization-round2.md`（#101–200）
> 本轮视角：**交互体验 / 交互动画 / 过渡动画 / 交互操作逻辑 / 用户体验 / 产品经理思维**，编号 #201–250。
> 方法：静态代码审查（未运行应用）。动效观感与实际帧率需实测复核，见文末「验证缺口」。

## 判定标准

沿用前两轮：

| 级别 | 判定 |
|------|------|
| **P0** | 缺陷已成立 / 可访问性阻断，发布前必须修 |
| **P1** | 核心体验痛点 + 明显一致性缺口，下版应做 |
| **P2** | 有价值但不紧急，中期排期 |
| **P3** | 锦上添花 / 可选 |

## 三个总体判断

**1. 动效体系严重欠发达。** 全项目仅 7 个 `@keyframes`、15 条 `transition`（其中 5 条动的是 layout 属性，违反本项目自己的 `rules/ecc/web/performance.md`）。89 处 `:hover` 对 2 处 `:active`，而这 2 处都在 resizer 拖拽手柄上（`styles.css:1454`、`:1520`）—— 也就是**没有任何按钮有按下态**，这在桌面端尤其明显，因为没有触屏的高亮兜底。

**2. i18n 是半成品，当前状态比纯中文更糟。** `src/lib/i18n.ts` 有 596 个 key，但 84 个 `.tsx` 里只有 20 个接入 `t()`；49 个组件硬编码中文，含新用户第一眼看到的 `EmptyState`。切到 English 后是中英混排。

**3. `prefers-reduced-motion` 实现有两个已成立的缺陷**（#201、#202），且都不只是观感问题 —— 一个产生隐形可点元素，一个让加载指示器停转。

---

## P0 · 阻断级（3 条）

| # | 建议 | 证据与理由 |
|---|------|-----------|
| 201 | **reduced-motion 下 `memory-dock` 变成隐形但可聚焦、可点击的元素** | `styles.css:1194` 是 `animation: memory-dock-fade 3.4s var(--ease) forwards`，被 `styles.css:3266` 的全局 `animation-duration: 0.001ms !important` 压成瞬时；`forwards` 立刻锁定 `opacity: 0`。但 JS 要到 `HOLD_MS + FADE_MS = 3400ms` 才卸载（`MemoryDock.tsx:22`）。这 3.4 秒内存在一个看不见却能 Tab 聚焦、能点击的「打开」按钮。修法：reduced-motion 下 `animation: none`，完全交由 JS 卸载。 |
| 202 | **reduced-motion 下 `.spinner` 停转** | `styles.css:3267` 的 `animation-iteration-count: 1 !important` 同时命中 `.spinner` 的 `animation: spin .7s linear infinite`（`styles.css:998`），转一圈即停在起点。reduced-motion 的语义是减少位移与前庭刺激，不是移除状态指示。应将 `.spinner` 排除，或在该 media query 内替换为不旋转的透明度脉冲。 |
| 203 | **`QueueStrip` 的移出按钮键盘不可达** | `QueueStrip.tsx:95` 的 `.queue-x` 是 `<button>` 内嵌的 `<span>`，带 `aria-label` 但不可聚焦；移出依赖 `onClick` 里 `e.target.classList.contains("queue-x")` 判断（`:89`）。键盘与读屏用户无法移出已排队消息。button 内嵌 button 也是非法 HTML。应拆为并列的两个按钮。 |

---

## P1 · 高优先（14 条）

### 交互体验

| # | 建议 | 证据与理由 |
|---|------|-----------|
| 204 | **12 处 `outline: none`，其中 10 处未配对替代焦点样式** | `styles.css` 的 320、1745、1751、1873、2007、2068、2329、3098、3245 行，其中 `:2074` 是裸 `:focus { outline: none }`。`.toc-tick`（`:656`）与 `.resizer`（`:1524`）做对了 —— 用 `::before` 变形代偿；其余是净损失。键盘用户会丢失焦点位置。 |
| 205 | **侧栏会话树只处理 `Tab`** | `Sidebar.tsx:205` 的 `onSessionTreeKeyDown` 仅在 `e.key !== "Tab"` 时 return。`role="list"`（`:406`）的树缺 `↑/↓` 移动、`←/→` 折叠展开、`Home/End` 跳首尾。`Resizer.tsx:66` 的键盘实现是全项目最完整的（arrows / Shift 大步 / Home-End / Enter 复位），照它做。 |
| 206 | **`CommandPalette` 的 listbox 缺 `aria-activedescendant`** | `CommandPalette.tsx:96` 是 `role="listbox"`，但 input（`:81`）不是 `role="combobox"`，无 `aria-controls`、无 `aria-activedescendant`。读屏软件不会播报当前高亮项 —— ⌘K 是主要入口，这条影响面大。 |
| 207 | **命令面板里 `onMouseEnter` 无条件抢走键盘高亮** | `CommandPalette.tsx:116`。方向键选到第 5 项时，鼠标偶然掠过列表会跳走。应记录「最后一次输入源」，方向键操作后忽略 hover，直到出现真实 `mousemove`。 |
| 208 | **队列满时用户输入被静默丢弃** | `useAcpSession.ts:1080` 与 `:1088`：`enqueue` 返回同一引用即视为满，弹 toast 后 `return`，但 `text` 不回填输入框。用户刚敲的内容消失。应保留在 composer 里，或在 toast 上提供「替换最后一条」动作。 |
| 209 | **124 处原生 `title=` 当 tooltip** | 原生 tooltip 延迟约 1–2 秒、触屏不可达、无法配合主题样式。`.toc-tip`（`Thread.tsx:716`）已是自绘 tooltip，抽成 `<Tooltip>` 复用即可覆盖大部分场景。 |

### 交互操作逻辑

| # | 建议 | 证据与理由 |
|---|------|-----------|
| 210 | **`yolo`（始终批准）模式缺持续视觉标记** | `mode.ts:42` 的 `modeNeedsConfirm` 只在**切入时**确认一次，之后跳过全部权限卡（`mode.ts:8` 的 `MODE_OPTIONS` 描述为「本轮跳过许可卡」）。这是全应用风险最高的状态，界面上只有一个小 chip。建议 composer 边框或整个 dock 变色，让「当前无人看守」一眼可见。 |
| 211 | **`Escape` 语义过载：关菜单与取消长轮次共用一个键** | `app-hotkeys.ts:34` —— `cancel` 在 `overlayOpen` 时让位给关浮层。但取消一个跑了 5 分钟的 turn 与关一个菜单，代价差三个数量级。`lib/confirm.ts` 已有 arm-then-confirm 机制（首次点击 arm、窗口内二次确认），直接复用给 `cancel`。 |
| 212 | **快捷键冲突不检测，靠后的静默失效** | `app-hotkeys.ts:31` 顺序遍历 `APP_HOTKEYS`，返回第一个 `matchBinding` 命中项。两个 action 绑同一键时后者永不触发，用户无从得知。`ShortcutsTable` 保存时应校验冲突。 |
| 213 | **`ShortcutsTable` 要求用户手打绑定字符串** | `ShortcutsTable.tsx:27` 是裸 `<input>`，用户需自行输入 `Mod+K` 这类 DSL（`parseBinding` 才认）。应改为「按下即录制」，并顺带做 #212 的冲突校验。 |
| 214 | **`Mod+W` 关窗格无守卫** | `app-hotkeys.ts:35` 的 `canClosePane` 只判断「能不能关」，不判断「该不该问」。有未发送草稿或正在运行的轮次时应二次确认 —— `⌘W` 是关窗口的肌肉记忆，误触概率高。 |
| 215 | **`Mod+1..9` 在中文输入组字期间也会触发** | `useSessionHotkeys.ts:33` 的注释明确承认了这个取舍（「⌘/Ctrl chords 不是文本输入，必须在 composer 聚焦时仍然生效」）。但 macOS 上 `⌘1-9` 常被输入法用于选候选词，中文输入时会误跳会话。`lib/ime-enter.ts` 已在追踪组字状态，接上即可。 |
| 216 | **发送 / 排队 / 改向三态由父组件决定，规则对用户不可见** | `Composer.tsx:74–79`：`onSend` 在 `busy` 时含义会变，`onAlt` 是「`onSend` 没做的那个」。主按钮文案应始终反映当前按下会发生什么，而非让用户猜。 |
| 217 | **`window.confirm` 迁移未完成** | `ChangesPanel.tsx:90` 仍用 `window.confirm`，而 `AppModal.tsx:13` 的注释写明它就是为替换 `window.confirm`「以免阻塞主线程」而建。丢弃文件改动是不可逆操作，却用着会冻结 UI 的原生弹窗。 |

### 产品经理思维

| # | 建议 | 证据与理由 |
|---|------|-----------|
| 218 | **i18n 完成度是当前最大的产品债** | `i18n.ts` 有 596 个 key，基础设施齐备；但 84 个 `.tsx` 中仅 20 个引入 `t()`/`useT()`，49 个硬编码中文且完全未引入 i18n（含 `EmptyState`、`QueueStrip`、`ShortcutsTable`、`SlashMenu`、`ToolResult`、`prompt-queue.ts:48` 的 `queueLabel`、`useAcpSession.ts:1080` 的 toast）。**当前状态比纯中文更糟** —— 切到 English 是中英混排，观感是半成品。要么补完，要么先隐藏语言切换入口。 |
| 219 | **README 承诺四个 agent，代码里 grok 仍是一等公民** | README 的 Agents 表列出 Grok / Kimi / Claude / Codex，但 `EmptyState.tsx:26` 检查 `info.grokPath`、`:31` 提示 `grok login`、`:32` 提供「复制 grok login」。用 Kimi 的用户首次启动会被要求去装 grok。包名 `grok-build-webui` 同理。这是 star 转化路径上的第一个坑。 |
| 220 | **没有预编译 release，绝大多数 star 不会变成用户** | README Quick start 要求 `npm install` + `npm run tauri dev`，即需要 Rust 工具链。CI 已在跑（`.github/workflows/ci.yml`），加一个 release workflow 产出 `.dmg` / `.msi` / `.AppImage` 是当前**投入产出比最高**的一件事。README「Status and boundaries」已声明无自动更新，那就更需要可下载的安装包。 |

---

## P2 · 中期（22 条）

### 交互动画

| # | 建议 | 证据与理由 |
|---|------|-----------|
| 221 | **没有任何按钮有按下态** | 全部 CSS 里仅 2 处 `:active`，且都在 resizer 手柄（`styles.css:1454`、`:1520`），对照 89 处 `:hover`。给 `button, .icon-btn, .session, .new-task` 加 `:active { transform: scale(0.97) }`。桌面端没有触屏的高亮兜底，按下反馈更重要。 |
| 222 | **权限卡没有入场动效** | `PermissionCard.tsx:111` 起的 `.permission` 无 animation。这是全应用最需要被立刻注意到的元素，出现方式却和普通文本一样。建议 `rise-in` + 一次极轻的边框脉冲（一次，不循环）。 |
| 223 | **只有一种 ease 曲线** | `tokens.css:38` 仅 `--ease: cubic-bezier(0.22, 1, 0.36, 1)`（ease-out 型）。入场用 ease-out、出场用 ease-in、位移用 ease-in-out 是基本分工。补 `--ease-in`、`--ease-in-out`。 |
| 224 | **只有两档时长，缺大位移档** | `tokens.css:39–40` 仅 `--dur-fast: 100ms` / `--dur: 200ms`。面板、抽屉这类跨半屏的位移在 200ms 内完成会显得急促。补 `--dur-slow`（约 320ms）。 |
| 225 | **`memory-dock` 时长在 CSS 与 JS 各写一遍且不相等** | CSS（`styles.css:1194`）是 `3.4s`、`88%` 起淡出 → 淡出窗口约 408ms；JS（`MemoryDock.tsx:12–13`）是 `HOLD_MS 3000 + FADE_MS 400`。两处独立维护，已经漂移。应由 CSS 变量单一来源，或改用 `animationend` 事件驱动卸载。 |
| 226 | **`memory-dock` 3 秒自动消失，悬停不暂停** | `MemoryDock.tsx:22` 无条件 `setTimeout`。信息还没读完就没了，且它承载「项目记忆已更新」这类需要阅读的内容。hover / focus 时应暂停计时。 |
| 227 | **`DotMatrix` 的 32 个时长常量硬编码** | `DotMatrix.tsx:6–7` 是两个 16 元素数组。改用 `--i` CSS 自定义属性 + `calc()` 生成错峰，可消掉 32 个魔法数字（也符合本项目 `coding-style.md` 的「无硬编码值」）。 |
| 228 | **`usePresence` 疑似死代码** | `motion.ts:20` 的 `usePresence` 专为「保持挂载播完退场动画」而写，注释提到 `rail-out`，但 CSS 里搜不到任何 `.leaving` 或 `rail-out` 规则。要么补上退场样式，要么删掉这个 hook —— 现状是有能力但无消费者。 |

### 过渡动画

| # | 建议 | 证据与理由 |
|---|------|-----------|
| 229 | **`transition: grid-template-columns` 动的是 layout 属性** | `styles.css:35`。侧栏展开收起时每帧触发全窗口重排。本项目 `rules/ecc/web/performance.md` 明确列 `width` 类布局属性为禁止项。应改为固定宽度容器 + `transform: translateX()`。 |
| 230 | **`grid-template-rows: 0fr → 1fr` 同为 layout 动画，且 WebKit 表现不稳** | `sidebar.css:148` 与 `:263`。Tauri 在 macOS 上正是 WebKit —— 这是主验证平台（README 声明 macOS 13+ 为开发与验证环境）。展开长会话列表时易掉帧。 |
| 231 | **`transition: width` 用于 `.toc-tick`** | `styles.css:648` 声明了 `width` 过渡，hover 态在 `:650–655` 把 2px 改成 4px。用 `scaleX()` 可走合成层，视觉等价。 |
| 232 | **`transition: left` 应为 `translateX`** | `styles.css:1053`。`left` 触发 layout，`translateX` 只触发 composite。 |
| 233 | **主题切换只过渡三个颜色属性** | `styles.css:20` 是 `background-color, color, border-color`。`box-shadow`、`fill`、`stroke`、`outline-color` 会硬跳 —— 深浅主题互切时图标与阴影跟不上底色。 |
| 234 | **虚拟列表与普通列表切换会闪** | `Thread.tsx:638` 的 `virtualize` 三元：翻转瞬间 DOM 整体替换、滚动位置重算。切换前记录锚点消息 id，切换后 `scrollToRow` 复位。 |
| 235 | **无 `will-change` / `contain`** | 全项目 0 处。虚拟滚动容器 `.thread-list` 加 `contain: layout paint` 可显著缩小重排范围。注意 `will-change` 要用完即撤（本项目 web 规则亦如此要求）。 |

### 用户体验

| # | 建议 | 证据与理由 |
|---|------|-----------|
| 236 | **`EmptyState` 全部硬编码中文** | `EmptyState.tsx:24–39` 的 `title` 与 `steps` 文案均为字面量，未引入 i18n。这是新用户第一眼看到的界面，也是 #218 里最该优先补的一个文件。 |
| 237 | **`ErrorBoundary` 丢弃全部错误信息** | `ErrorBoundary.tsx:20` 仅 `console.error`，渲染时只给标题 + 「重试」（`:28–40`）。用户无法复制堆栈、无法据此提 issue。开源项目应提供一键复制诊断信息。 |
| 238 | **`ErrorBoundary` 的重试会形成点击死循环** | `ErrorBoundary.tsx:32` 的 `onClick` 只做 `this.setState({ error: null })`，不重置子树。同一个渲染错误会立刻再次抛出。应配合递增 `key` 强制重新挂载。 |
| 239 | **无骨架屏** | 全项目 0 处 `skeleton`。会话切换、Git 状态加载期间是空白或内容突然跳出。 |
| 240 | **状态变化缺 `aria-live` 播报** | 仅 2 处 `aria-live`（`Thread.tsx:602` 的 turn 播报，另一处 status）。权限超时、连接断开（`run-status` 的 `disconnected` / `stalled` / `trust-required`）这些关键状态，读屏用户收不到。`RunStatusRegion.tsx` 是天然的挂载点。 |
| 241 | **通知只在轮次完成时发** | `useAppModel.ts:799` 与 `usePermissionQueue.ts:101` 是唯二 `notify()` 调用点。而**权限卡等待**才是最需要打断用户的场景 —— agent 停在那里等授权，用户可能已经切走。`windowFocused()`（`api.ts:398`）已具备判断依据。 |
| 242 | **带撤销的 toast 生命周期太短** | `timeout-ref.ts:4` 固定 `TOAST_CLEAR_MS = 2800`，`useToast` 对有 action 与无 action 的 toast 一视同仁。撤销窗口 2.8 秒等于没有撤销。带 action 时应延长（约 6s）且 hover 暂停。 |
| 243 | **`aria-checked` 与 radio/checkbox 角色需逐项核对** | 统计上 `aria-checked` 9 处，`role="radio"` 3 + `menuitemradio` 3 + `menuitemcheckbox` 3 = 9 处，数量刚好但不保证一一配对。缺 `aria-checked` 的 radio 对读屏完全不可用，值得写一条 lint 或测试。 |
| 244 | **仓库根目录有临时产物** | `.tmp-acp-probe/`、`.tmp-ui-check/`、`prototype/`、`design/`、`.DS_Store`、`tsconfig.tsbuildinfo` 都在版本控制视野内。开源项目的根目录是第一印象，应清理或补进 `.gitignore`。 |

### 工程债（产品经理视角）

| # | 建议 | 证据与理由 |
|---|------|-----------|
| 245 | **`styles.css` 3195 行，超本项目自定 800 行上限 3 倍** | `rules/ecc/common/coding-style.md` 写明「800 max」。`src/styles/` 下已有按域拆分的 `thread/sidebar/composer/review/settings/tokens`，说明方向明确但迁移未完成 —— 大量样式仍留在主文件。 |
| 246 | **`useAppModel.ts` 2368 行，且比 round 2 时更大** | round 2 的 #105 已提出拆分（当时 1860 行），现在增长到 2368 行。它是全应用状态中枢，改动风险最高却最难 review。按 round 2 的建议裂成 state / derivations / actions 三层。 |
| 247 | **无 E2E 与视觉回归** | 163 个 `.test.ts`（`src/lib` 156 / `src/hooks` 4 / `src/components` 3）全为纯逻辑单测，无一个 `.test.tsx`，`package.json` 无 Playwright。单测覆盖其实很厚 —— 缺的恰好是 UI 那一层。对一个「UI 本身即核心价值」的产品，UI 完全没有自动化验证。本项目 `rules/ecc/web/testing.md` 把视觉回归列为第一优先级。 |
| 248 | **无遥测 → 无法判断优先级** | 上述条目里哪些真正影响用户，目前只能推测。桌面端可做本地聚合、明确 opt-in 的匿名统计（快捷键使用率、权限卡响应时长、模式分布），再据此排期。 |

---

## P3 · 可选（2 条）

| # | 建议 | 证据与理由 |
|---|------|-----------|
| 249 | **队列排序仅支持鼠标拖拽** | `QueueStrip.tsx:52` 起的 `draggable` + `onDragStart/Over/Drop`。`reorderQueue`（`prompt-queue.ts:31`）逻辑已现成，补 `Alt+↑/↓` 即可让键盘用户可用。列为 P3 是因为队列上限只有 10 条（`MAX_QUEUED`），排序需求本身不高频；但若做了 #203 的按钮拆分，这条顺手就能带上。 |
| 250 | **`Thread` 的 `.toc` 目录导航缺当前位置指示** | `Thread.tsx:670` 起的 `<nav className="toc">` 刻度条有 hover tooltip 与点击跳转，但没有「当前可见轮次」的高亮。长会话里用户不知道自己在哪。可用 IntersectionObserver 标记 —— 本项目 web 规则也推荐它优于 scroll handler。 |

---

## 汇总

| 级别 | 数量 |
|------|------|
| P0 | 3 |
| P1 | 14 |
| P2 | 22 |
| P3 | 2 |
| **合计** | **50** |

按六个视角分布：

| 视角 | 条目 |
|------|------|
| 交互体验 | 203, 204, 205, 206, 207, 208, 209 |
| 交互动画 | 201, 202, 221, 222, 223, 224, 225, 226, 227, 228 |
| 过渡动画 | 229, 230, 231, 232, 233, 234, 235 |
| 交互操作逻辑 | 210, 211, 212, 213, 214, 215, 216, 217, 249 |
| 用户体验 | 236, 237, 238, 239, 240, 241, 242, 243, 244, 250 |
| 产品经理思维 | 218, 219, 220, 245, 246, 247, 248 |

## 推进建议

**如果只做三件事：**

1. **#201 / #202** —— reduced-motion 的两个缺陷。改动量各几行 CSS，但一个产生隐形可点元素、一个让加载指示器停转，都是已成立的可访问性问题。
2. **#218** —— 补完 i18n。工作量最大，但它是当前唯一「越做一半越难看」的债：596 个 key 的基础设施已经建好，停在 20/84 的接入率上，等于白付了成本还倒赔观感。
3. **#220** —— 出预编译 release。CI 已在跑，加 release workflow 的边际成本最低，而它直接决定 star 能否转化为用户。

**分泳道：**

- **动效泳道**（#221–235）适合一次性集中做：先补 token（#223 / #224），再逐个替换 layout 属性动画（#229–232），最后补 `:active` 与权限卡入场（#221 / #222）。分散做会反复改同一批文件。
- **可访问性泳道**（#203–207、#240、#243）建议配一条 lint 或测试固化，否则会回归。`Resizer.tsx` 可作为键盘交互的参考实现。
- **工程债泳道**（#245–247）与功能开发并行，其中 #246 是 round 2 的 #105 未完成项且已恶化，优先级应上调。

## 验证缺口

本轮为**静态代码审查，未运行应用**。以下需实测复核：

- #201 / #202 的实际表现（需在系统开启「减弱动态效果」后观察）
- #229–232 涉及的掉帧问题（需 DevTools Performance 面板确认，特别是 WebKit 下的 `grid-template-rows` 动画）
- #234 的闪烁（需构造超过虚拟化阈值的长会话）
- #243 的 `aria-checked` 配对情况（需逐个组件核对，统计数字只说明总量吻合）

前两轮遗留的核对任务（round 2 文末提到「多数改进方向已存在但可能未完全接入」）在本轮同样成立 —— `usePresence`（#228）就是一个具体实例：能力已建好，但找不到消费者。
