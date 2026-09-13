# Grok Build Desktop · 优化建议 第四轮（round 4）· UI 设计与交互体验专项

> 版本：0.4.0+ review · 日期：2026-09-06 · 分支：`feat/multi-agent-workbench`
> 前置：round 1（#1–100）、round 2（#101–200）、round 3（#201–250）、08-30 视觉 checklist（50 条）
> 本轮编号：**#251–350**，共 100 条，按 P0→P3 分组排序
> 方法：6 个独立评审视角并行静态走查当前代码（设计系统 / 聊天交互流 / 导航 IA / 无障碍 WCAG 2.2 / 性能感知 / 组件微交互）+ 对当前发布截图（`docs/readme/preview-*.png`）与原型截图的视觉核对
> 维度标签：`视觉` `交互` `导航` `无障碍` `性能感知` `微交互` `文案`

## 判定标准

| 级别 | 判定 |
|------|------|
| **P0** | 缺陷已成立且直接破坏核心流程 / 阻断一类用户 / 误导性界面，发布前必须修 |
| **P1** | 核心体验痛点 + 明显一致性缺口，下版应做 |
| **P2** | 有价值但不紧急，中期排期 |
| **P3** | 锦上添花 / 可选 |

## 总体判断（五个结构性结论）

**1. 流式性能仍是本产品最大的体验黑洞，且 round 2 的性能债基本未消化。** 根组件一次性解构约 250 个状态字段，流式 token 每个 rAF 帧触发整树重渲染；全项目仅 2 处 `memo` 且全部被内联回调击穿；侧栏因 `chat.items` 泄漏进依赖链而每帧全量重建，并伴随每秒 60 次的 dock 角标 IPC。长会话的"打字机卡顿 + 输入滞后"不是观感问题，是架构问题（#251–#255、#297–#302）。

**2. 键盘与读屏路径在"菜单族"上整体断裂。** @提及菜单 Enter 会误发送（#257）、斜杠菜单高亮恒为第一项（#287）、5 个模态无焦点陷阱（#290）、全局焦点环对比约 1.2:1 几乎不可见（#289）。round 3 修了 QueueStrip 与 reduced-motion，但菜单族是重灾区且此前未覆盖。

**3. 视觉系统"token 建了但没守住"。** 圆角 token 命名序列颠倒（xl < m < l）、约 60 处硬编码圆角绕过、无 spacing scale、107 处硬编码字号、z-index 16 种取值靠文件加载顺序压制；同时打包了从未引用的 Inter 字体、却依赖未打包的 HarmonyOS Sans（#259、#261–#271）。

**4. 命名与信息架构存在多处"一词多义 / 多词一义"。** "Dashboard" 一词三义、"文件" 与 "文件管理" 撞车、三个确认模式并存、快捷键表与实际绑定脱节；六个全局视图（总览/代理/记忆/用量/想象/扩展）对鼠标用户零可发现入口（#277–#286）。

**5. i18n 半成品状态延续第三轮且仍在恶化面。** 596 个 key 的基础设施、约 20/84 组件接入率；本轮新确认导航关键面（侧栏 band 标签、预览动作、设置状态词、Dashboard 分组词）全部硬编码中文，EN locale 下中英混排（#285）。

## 优先级汇总

| 级别 | 数量 | 编号 |
|------|------|------|
| P0 | 10 | #251–260 |
| P1 | 56 | #261–316 |
| P2 | 29 | #317–345 |
| P3 | 5 | #346–350 |

---

## P0 · 阻断级（10 条）

### #251 · 单体 App 壳：全部状态挂根组件，流式 token 每帧整树重渲染
- 证据：`App.tsx:78–353` 一次解构 `useAppModel()` 约 250 个字段；`useAppModel.ts`（2300+ 行）聚合 60+ 个 `useState`；流式每帧 `setChat`（`useAcpSession.ts:466`）→ Sidebar/Thread/Composer/ReviewRail/全部 overlay 陪跑。全项目仅 `Thread.tsx` ChatRow 与 `Markdown.tsx` 两处 `memo`。
- 建议：按域拆状态（chat/draft 独立 store 或分域 Context），Sidebar 只订阅 sessions/status、Composer 只订阅 draft/busy；短期止血：四大区块包 `memo` + props 稳定化；`renderSplitLeaf`（`App.tsx:355–605`）抽成 `<PaneLeaf>` memo 组件。
- 维度：性能感知 · 延续 round 2 #105/#107（未消化，且 hook 更大）

### #252 · ChatRow / Markdown 的 memo 被内联回调全部击穿，虚拟化收益归零
- 证据：`App.tsx:925–934` 传给 ChatRow 的 `onCancel/onResendUser/onForkTurn/onPreviewPath` 每次渲染都是新箭头函数；`Thread.tsx:238` 内联 `onClick` 击穿 Markdown 的 memo。流式期间每个 rAF 帧所有可见行完整重渲染、每条历史消息重跑 `splitAssistantBlocks`。
- 建议：下传回调用 `useCallback` 稳定化，或改"动作总线"（`onAction(kind, id)`）在行内绑 id；加开发期 render-count 断言：流式 1 秒内非活动行渲染次数应为 0。
- 维度：性能感知 · 延续 round 2 #110

### #253 · 流式消息每帧全量重解析 Markdown 并整体替换 innerHTML
- 证据：`Markdown.tsx:35–36` live 消息绕过缓存每帧 `renderMd`（`marked.parse` 全文 + `text.ts:42–50` 六个串行正则 sanitize）；结果经 `dangerouslySetInnerHTML` 注入，HTML 每帧不同 → 子树每帧销毁重建（代码高亮 span、图片、表格全部重挂载），并丢失文本选择。20KB 回复 ≈ 每秒 60 次全文 parse，代价 O(n²) 累积。
- 建议：live 渲染节流到 8–12Hz；按块切分增量渲染（已封口块走 `memoizeMarkdown`，只重跑最后一个未闭合块）；流式尾部用 append-only 文本节点，收尾一次性换完整 HTML。
- 维度：性能感知

### #254 · `chat.items` 泄漏进 `allSessions` 依赖链：侧栏每帧全量重建 + dock 角标 IPC 风暴
- 证据：`useAppModel.ts:422–430` `allSessions` 依赖 `chat.items` → 级联 `busyIds`/`statusFor`/`sidebarSections` 每帧重算（内含 filter/partition/sort/localeCompare）；`useAppModel.ts:1741–1743` 每帧一次 `setBadge` Tauri IPC（60 次/秒）；palette 关着也每帧重建命令项。
- 建议：live roster 改依赖轻量 `rosterVersion` 计数而非 `chat.items`；`setBadge` 值比较 + ≥1s 节流；`sidebarSections` 依赖去掉 `clock`，相对时间交给行内 ticker；palette items 惰性到 `open === true`。
- 维度：性能感知

### #255 · Composer 按键路径：全局重渲染 + 强制同步布局 + 无防抖提及 IPC
- 证据：每键 `setDraft`（App 根状态）→ 整树重渲染；`Composer.tsx:251–253` + `growArea` 写 height=0 → 读 scrollHeight → 再写，read-after-write layout thrash；`Composer.tsx:499–515` `@` 提及每键直接 `await listFiles(q)` 全量列目录 IPC，无防抖。
- 建议：draft 下沉 Composer 本地 state，仅 submit/blur/切换会话时同步；`listFiles` 加 100–150ms 防抖；`growArea` 合并进单次 rAF 或改用 CSS `field-sizing: content`。
- 维度：性能感知 · 交互

### #256 · 中断（Stop）后队列消息立即自动发出，中断语义被破坏
- 证据：用户点 Stop 的本意是"停下来我要改方向"，但 `useAcpSession` 在 turn 结束后立即消费 QueueStrip 里排队的消息，中断形同虚设，且可能发出用户已不想发的指令。
- 建议：Stop 后暂停队列消费，QueueStrip 显示"已暂停 · 继续发送 / 清空"两个动作；或 Stop 时弹一次性确认"是否继续发送队列中的 N 条"。
- 维度：交互

### #257 · @提及菜单完全无法用键盘操作，Enter 反而把半截「@query」误发送
- 证据：`MentionMenu` 无方向键/Enter 选择路径；菜单打开时按 Enter 走 composer 的发送逻辑，把未完成的 `@src/comp` 当正文发出（合并自无障碍维度与聊天流维度的同一缺陷）。
- 建议：菜单打开时接管 Enter/↑↓/Esc（Enter 选中插入引用、Esc 关闭），并给 textarea 加 `role="combobox"` + `aria-controls` + `aria-activedescendant` 关联（见 #288）。
- 维度：交互 · 无障碍

### #258 · 侧栏批量操作工具栏是死 UI：多选后三个按钮永久禁用
- 证据：`Sidebar.tsx:373–413` shift/meta 多选后渲染"标为已读/归档/删除"工具栏，但 `App.tsx:618–698` 从未传 `onDeleteSessions/onMarkReadSessions/onArchiveSessions/onStartRename` 四个 props（全仓零命中）；L420–426 双击重命名同样静默无效。用户看到永远灰掉的按钮。
- 建议：补齐四个回调（批量删除复用 `setAppConfirm` 并显示条数；双击重命名桥接已有 `beginEditTitle`）；短期宁可不展示多选交互，也不展示不可用功能。
- 维度：导航 · 微交互

### #259 · 语义色当文字色：浅色 `--warn` 对比约 1.5:1、深色 `#fff` on `--ok` 约 2.1:1
- 证据：`tokens.css` 的 `--warn`（黄）直接用于停滞警告/等待态文字（浅色主题），`--ok` 深底配白字仅 2.1:1，均远低于 WCAG AA 的 4.5:1；这些恰是"agent 卡住了"这类最关键的信息。
- 建议：拆分 fg/bg 成对 token（`--warn-fg` 在浅色下取深琥珀、`--ok-fg` 同理），全局替换文字用途；背景/边框用途保留原 token。
- 维度：视觉 · 无障碍 · 延续 round 2 #158

### #260 · PermissionCard 秒级倒计时放在 `role="status"` 活区，读屏每秒播报一次
- 证据：权限卡倒计时数字每秒变化且容器为 live region，屏幕阅读器用户被每秒打断一次，真正该播报的"需要授权"反而被淹没。
- 建议：倒计时移出 live region（视觉保留、`aria-hidden`），live region 只播报一次"等待授权：〈工具名〉，剩余 90 秒"；倒计时归零前 10 秒再播报一次。
- 维度：无障碍 · 微交互

---

## P1 · 高优先（56 条）

### 视觉系统

### #261 · 字体策略断裂：打包的 Inter 零引用，真正用的 HarmonyOS Sans 未打包
- 证据：`main.tsx:5–8` 引入 4 个字重 Inter CSS（渲染阻塞 + 20 余个 woff2），但 `tokens.css:29–32` 全文无一处引用 Inter；`--font` 依赖本机安装的 HarmonyOS Sans / PingFang SC，跨机器排版漂移。
- 建议：删除 Inter 依赖与 import；把实际使用的字体（含中文回退策略）打包或明确系统栈契约；Source Serif 4 仅保留 latin 子集并延迟加载非首屏字重。
- 维度：视觉 · 性能感知

### #262 · 圆角 token 命名序列颠倒（xl=12 < m=16 < l=24）+ 约 60 处硬编码圆角绕过
- 证据：`tokens.css` 圆角刻度名实不符；全仓 22 种硬编码圆角值散布在组件 CSS 中，同类卡片圆角不一致。
- 建议：重排为 `--radius-xs/s/m/l/xl` 单调序列并全局替换；补一条 stylelint 规则禁裸圆角值。
- 维度：视觉

### #263 · 无 spacing scale：14 种 gap 档位、同类卡片四种 padding
- 证据：`styles/*.css` 中 gap/padding 取值散点分布（8/10/12/14/16/18/20/24…），同类卡片（permission / question / plan-complete / recap）内边距各不相同。
- 建议：定 4px 基 6 档 spacing token，卡片内边距统一为两档（紧凑/常规），逐文件替换。
- 维度：视觉

### #264 · 字阶未 token 化：107 处硬编码 px 字号，含 12.5/13.5/14.5 半像素与 9px 过小文本
- 证据：半像素字号在低 DPI 屏渲染发虚；9px 文本低于可读下限。
- 建议：定 5 档字阶 token（11/12/13/14/16/18），<11px 全部上调；密度模式通过 token 切换而非散落覆盖。
- 维度：视觉 · 无障碍

### #265 · paper/ink 主题族覆盖不全：paper 深色丢暖色 accent、ink 浅色冷暖混搭
- 证据：`palette.css` 四象限中 paper-dark 的 accent 回落为冷灰、ink-light 混入暖色 surface，主题族切换后观感断裂。
- 建议：为四个象限各补齐 surface/accent/line 三组完整 token，并做四象限截图对照回归。
- 维度：视觉

### #266 · 模态 scrim 三套写法并存（rgba 0.2 / rgba 0.42 / color-mix 70%），明暗不分
- 证据：`overlays.css`/`settings.css`/`hub.css` 各写各的遮罩，深色主题下 0.2 遮罩几乎无分离感。
- 建议：统一 `--scrim` token（明暗各一值），三处替换。
- 维度：视觉

### #267 · z-index 无刻度：16 种取值，靠 CSS 文件加载顺序互相压制
- 证据：已出现"补丁式注释"（某选择器注明"必须高于 xxx"）；新增弹层只能试错加数字。
- 建议：定 5 档 z token（dropdown < popover < modal < toast < spotlight），全仓替换并删注释补丁。
- 维度：视觉

### #268 · 权限卡与 hub-row 硬编码 `max-width: 680px`，绕过 `var(--thread)` 阅读宽度
- 证据：用户在设置里调宽聊天列后，权限卡/扩展行仍停 680px，与上下文宽度不齐、视线跳跃。
- 建议：改 `width: min(100%, var(--thread))`，与消息列同宽策略。
- 维度：视觉 · 交互

### #269 · `--md-size` 兜底 15/16px 分裂；composer 输入框固定 13px + `--muted`，不随聊天字号设置
- 证据：聊天字号设置只影响消息正文，输入框永远是 13px 灰字——"我说的话比 agent 说的话小两号"，层级倒挂。
- 建议：composer 字号 = `calc(var(--md-size) - 1px)` 且用正文色；placeholder 才用 muted。
- 维度：视觉 · 交互

### #270 · 分段控件四套互不一致实现（side-view / hub-nav / review-panes / choice-switch）
- 证据：四种" segmented control "在高度、圆角、选中态（底色/下划线/加粗）、键盘模型上各不相同；发布截图右上视图切换条即其中之一。
- 建议：抽一个 `<Segmented>` 组件 + 一套 CSS，四处替换；选中态统一为"底色 + 微阴影"。
- 维度：视觉 · 微交互

### #271 · 阴影仅两档且 `--shadow-l` 明暗同值：深色主题 modal 无分离感
- 证据：深色下大阴影不可见，modal 与背景只靠 scrim 区分；弹层缺中间档。
- 建议：阴影 token 明暗分值（深色加 1px 高光边 `inset` 补偿），补 `--shadow-m` 给 popover/menu。
- 维度：视觉

### 聊天与输入交互

### #272 · 主面板运行中没有常驻停止按钮，Stop 可得性远差于分屏窗格
- 证据：分屏叶子头部有 stop 入口，主聊天列运行中只能靠 Esc 二次确认或找 composer 右上角小图标；"想停的时候找不到停"是高压场景下的最差体验。
- 建议：busy 期间 composer 发送键原位 morph 为 Stop（同位置同尺寸），并在线程顶部 RunStatusRegion 同步一个 stop 动作。
- 维度：交互

### #273 · Stall 检测已有，但恢复动作 UI 全部断线
- 证据：`lib/stall.ts` 能判定停滞，`RunCockpit`/`WaitPill.note` 的"重试/查看/中断"动作未接线，用户看到"可能卡住了"却无事可做。
- 建议：停滞态卡片给出三个动作：继续等待 / 中断 / 复制诊断；停滞判定进入 `RunStatusRegion` 的 aria-live 播报（见 #337）。
- 维度：交互

### #274 · 权限卡出现时不接管焦点，卡上"↑↓ 移动，Enter 确认"提示实际不可用
- 证据：`PermissionCard` 渲染后焦点留在 composer；卡内提示的键盘操作因为没有焦点而无效（选项间 ↑↓ 无响应）。
- 建议：卡挂载时焦点移到默认选项（allow once），实现 roving tabindex + Enter 确认 + Esc 拒绝；提示文案与实现保持一致。
- 维度：交互 · 无障碍

### #275 · 工具输出内联硬截断为 8 行，无任何"查看更多"入口
- 证据：`ToolResult` 超过 8 行直接截断且无展开 affordance，用户只能去预览面板找全文——而多数用户不知道全文在哪。
- 建议：截断处加"展开剩余 N 行 / 在预览中打开"双动作；展开态记忆到会话级。
- 维度：交互

### #276 · IME 回车防护只覆盖主输入框，标题重命名/队列编辑会被中文组字回车误触发
- 证据：`lib/ime-enter.ts` 的组字状态只在 Composer 接线；`Sidebar` 行内重命名与 QueueStrip 编辑框在中文输入法组字期间按 Enter 会直接提交半截内容。
- 建议：把 `ime-enter` 封装成 `onCommitEnter` 工具函数，三处输入统一接入。
- 维度：交互

### 导航与信息架构

### #277 · 六个全局视图（总览/代理/记忆/用量/想象/扩展）对鼠标用户零可发现入口
- 证据：全部是 `ExtraOverlay` 模态覆盖层；常驻 UI 只有 AccountMenu 三项（设置/扩展中心/快捷键）；到达其余视图唯一途径是 ⌘K 或斜杠命令——纯键盘隐藏知识。
- 建议：Sidebar 底部 AccountMenu 上方加常驻导航区（图标+标签：会话总览/记忆/代理/用量），或并入 ReviewRail peer 体系；每个 ExtraPage 至少一个可点击固定入口。
- 维度：导航

### #278 · "Dashboard" 一词三义 + "文件/文件管理" 撞车：审阅面板命名体系需重构
- 证据：(a) ReviewRail 首 peer 叫 Dashboard（实为当前会话审阅）；(b) `/dashboard` 与 DashboardPanel 是跨会话总览；(c) 命令面板 `act:panel` "Dashboard" 与 `act:dashboard` "会话总览" 相邻两行极易点错；(d) sub-tab "文件"（本轮产物）与 peer "文件管理"（项目树）中文几乎同词。
- 建议：右栏 peer 改名"审阅 / Review"（其快捷键 id 本就叫 review）；sub-tab "文件"→"本轮文件"；peer "文件管理"→"目录"；跨会话页保留"会话总览"；同步 palette label 与 i18n 键。
- 维度：导航 · 文案 · 延续 08-30 checklist P0-4

### #279 · 项目级管理路径残缺：右键菜单只有置顶，全应用无"移除项目"入口
- 证据：`SessionMenu.tsx:95–112` ProjectMenu 仅 Pin/Unpin；误加的项目无法从工作区清除（`lib/projects` 有 `mergeProjectPaths` 但无 UI 出口）；也无"在访达/终端打开项目""在此项目新建会话"。
- 建议：扩展 ProjectMenu 五项：新建会话 / 在文件管理器打开 / 在终端打开 / 复制路径 / 从工作区移除（确认文案说明仅移除引用不删文件）。
- 维度：导航

### #280 · 多窗格分屏布局不持久化，重启即回到单窗格
- 证据：`useAppModel.ts:224` `paneTree` 是纯 `useState`；`useWebuiPersist.ts` 的 WebuiSnapshot 持久化了列宽/置顶/归档等，唯独没有 paneTree 与 pane-会话 bindings——产品核心卖点之一重启即丢。
- 建议：paneTree（纯 JSON）+ bindings 入 WebuiSnapshot；启动时校验 sessionId 存活性，失效叶子走 `pruneBindings` 降级。
- 维度：导航

### #281 · 快捷键表与实际绑定脱节：⌘1-9、Ctrl+Tab、⌘F 未列出不可重绑，且 ⌘1-9 语义反直觉
- 证据：`shortcuts-table.ts` 仅 9 行；⌘1-9 实际指向"侧栏可见顺序前 9 个会话"（含折叠项目里的行），与浏览器/IDE"第 N 个标签"心智相反且映射不可见；Ctrl+Tab MRU、预览 ⌘F、Git 提交 Enter 均硬编码不走 overrides。
- 建议：硬编码键收编进 DEFAULT_SHORTCUTS（只读行列出亦可）；⌘数字改按打开的 pane/MRU 编号并在侧栏行显示数字角标，让映射可见。
- 维度：导航 · 交互 · 延续 round 3 #212/#213

### #282 · Escape 三全局监听器并存：取消回合、关预览、关覆盖层会叠加执行
- 证据：右侧预览打开且会话运行中时，按一次 Esc 同时"武装取消回合"（toast 提示再按一次）并关掉预览——两个代价差三个数量级的语义叠加。
- 建议：建立 Escape 分层协议：焦点在预览/输入组件内时由该组件消费并 stopPropagation（PreviewPane 监听改挂 pane 元素）；全局 cancel 仅在焦点位于聊天列时触发；协议写进 `app-hotkeys.ts` 注释。
- 维度：交互 · 延续 round 3 #211

### #283 · ⌘W 默认"关闭窗格"：与 macOS 关窗肌肉记忆冲突，单窗格时静默无效
- 证据：`shortcuts-table.ts:14` close-pane → Mod+W；单 pane 时 `canClosePane=false` 直接 continue，按键无反应也不冒泡给系统；有未发送草稿/运行中轮次时也无守卫。
- 建议：close-pane 改绑 ⌘⇧W；⌘W 保留给窗口级关闭；关 pane 前对脏草稿/运行中轮次走 tapDanger 确认。
- 维度：交互 · 延续 round 3 #214

### #284 · 设置页搜索只在当前 tab 内过滤：跨 tab 无命中提示、无跳转
- 证据：`Settings.tsx:180/244` 搜索只驱动当前 tab；左侧 6 个 tab 不显示命中数角标，用户需手动切完；快捷键卡片放在"聊天" tab 需特判 scrollIntoView，本身说明分组错位。
- 建议：搜索跨全 tab 计算命中并在 tab 上显示角标，或切为扁平搜索结果列表（标注所属分组、点击定位）；ShortcutsTable 独立成"快捷键" tab。
- 维度：导航

### #285 · i18n 半成品延续：导航关键面全部硬编码中文，EN locale 中英混排
- 证据：`sidebar-list.ts:203–282` band/时间/状态标签、`DashboardPanel.tsx:12–16`（等你/进行中/空闲）、`ExplorerPane`/`PreviewPane`/`PreviewTabs`/`DetailsColumn` 动作词、`Settings.tsx:388–489` 状态词、`SidebarListMenu.tsx:251`"归档"、`PaneLayout.tsx:53` aria-label 均为字面量中文；另 `i18n.ts` 存在 palette.hubPlugins 值复制错误等 bug。596 key 基础设施、约 20/84 组件接入率。
- 建议：一次性清扫上述字符串入 key（"访达"按平台切"文件管理器/Explorer"）；加 lint 禁组件内裸中文字面量；完成前在设置页将 English 标注为 beta。
- 维度：文案 · 无障碍 · 延续 round 1 #55 / round 2 #124 / round 3 #218

### #286 · 窗口几何不恢复：无 window-state 插件，重启固定 1280×840
- 证据：`src-tauri/Cargo.toml` 无 `tauri-plugin-window-state`；`tauri.conf.json:14–22` 固定尺寸；列宽已持久化而窗口大小/位置/最大化状态每次丢失，多列工作台的断层明显。
- 建议：接入官方 window-state 插件（一行注册），conf 尺寸留作首启默认。
- 维度：导航

### 无障碍（键盘 / 读屏 / 对比）

### #287 · 斜杠菜单高亮恒为第一项（`active={0}` 硬编码），方向键无法选择命令
- 证据：`SlashMenu` 无 ↑↓ 导航、无 Enter 选中；与 #257 同族缺陷的斜杠侧。
- 建议：与 MentionMenu 共用一个 `useMenuKeyboard` hook（↑↓/Enter/Esc/Home/End），active 状态真实化。
- 维度：交互 · 无障碍

### #288 · 提及/斜杠菜单未与 textarea 建立 combobox ARIA 关联
- 证据：菜单是独立文档流元素，读屏用户输入 `@` 后感知不到候选列表存在。
- 建议：textarea 加 `role="combobox" aria-expanded aria-controls`，菜单 `role="listbox"`，选中项 `aria-activedescendant` 同步。
- 维度：无障碍

### #289 · 全局焦点指示器仅 1px + 8% 黑，对比约 1.2:1 几乎不可见
- 证据：`:focus-visible` 统一用 `--line-strong` 细环；键盘用户在浅/深主题下都难定位焦点（round 3 #204 修了 outline:none 净损失，但替代环本身太弱）。
- 建议：焦点环改 2px `--accent` + 1px 背景色描边（双环），对比 ≥3:1；全仓统一一处定义。
- 维度：无障碍 · 视觉 · 延续 round 3 #204

### #290 · 除 CommandPalette 外 5 个模态无焦点陷阱、无焦点还原、背景未 inert
- 证据：Settings / ExtraOverlay / MillerPicker / RewindDialog / AppModal 打开后 Tab 可跳出到背后内容；关闭后焦点落回 body。
- 建议：统一走 `lib/trap-focus.ts`（已存在）+ 关闭时还原触发元素；背景容器加 `inert`。
- 维度：无障碍

### #291 · MenuSelect 关闭时焦点丢失到 body，方向键高亮变化不被播报
- 证据：下拉关闭后焦点无处可归；选项高亮移动无 `aria-activedescendant`，读屏沉默。
- 建议：关闭还原触发按钮焦点；button 加 combobox 语义 + activedescendant。
- 维度：无障碍

### #292 · SessionMenu / ProjectMenu `role="menu"` 内是无 menuitem 的普通 button，打开不聚焦、无方向键导航
- 证据：role 与内部结构不匹配（读屏报 menu 但子项无 menuitem 角色）；打开后焦点留在触发器，↑↓ 无响应。
- 建议：子项加 `role="menuitem"`，打开聚焦首项，实现标准 menu 键盘模型（↑↓/Home/End/Esc/类型ahead）。
- 维度：无障碍

### #293 · `--faint` 浅色约 3.5:1，被用于 40+ 处 11–13px 小字
- 证据：fold-meta、palette-hint、时间戳等大量次级文本低于 AA（小字需 4.5:1）。
- 建议：`--faint` 仅用于装饰性元素（分隔线、图标底），文本一律 ≥`--muted`（并校准 muted 到 4.5:1）。
- 维度：无障碍 · 视觉

### #294 · 队列拖拽重排与会话拖放只有 HTML5 drag 一条路，无键盘替代
- 证据：QueueStrip 排序、侧栏会话拖拽均仅鼠标；键盘用户无法重排队列（round 3 #249 提过 Alt+↑↓ 方案，未落地）。
- 建议：QueueStrip 补 Alt+↑/↓ 重排 + 焦点态提示；会话拖放提供菜单替代项"移动到项目…"。
- 维度：无障碍 · 交互 · 延续 round 3 #249

### #295 · toc-tick（13×10px）与分栏 Resizer（5px）低于 WCAG 2.2 最小目标 24×24
- 证据：线程目录刻度与分栏手柄命中区过小；手柄 `:focus-visible` 还 `outline: none`（`panes.css:120`）。
- 建议：命中区用透明 padding/`::before` 扩到 ≥24px（视觉不变）；手柄 focus 给 2px accent 环或 grip 加宽到 3px。
- 维度：无障碍

### #296 · Settings toggle 无 `role="switch"`/aria-checked，range 滑块无可访问名称，label 无 htmlFor
- 证据：设置页大量开关是样式化 checkbox 或 div，读屏报不出开关状态；滑块无名。
- 建议：开关统一 `role="switch"` + `aria-checked`；range 加 `aria-label`/`aria-valuetext`；label 全部 htmlFor 关联。
- 维度：无障碍

### 性能感知（续）

### #297 · 全局秒级 `clock` + `clock * 0` hack：busy 期间整 App 每秒重渲染
- 证据：`useAppModel.ts:824–828` busy 时每秒 `setClock`（根状态）；`App.tsx:582` 用 `clock * 0` 人为制造依赖刷新计时文案；`Thread.tsx:601–605` 另有 liveTick 进 rowCtx → 虚拟列表可见行每秒全部重渲染。
- 建议：elapsed 下沉 WaitPill 叶子组件（自带 interval + 本地 state，App 只传 startedAt）；liveTick 只给 live 行；删除全局 clock，侧栏相对时间用 30–60s 低频行内 ticker。
- 维度：性能感知

### #298 · ThreadColumn 的 IntersectionObserver 每帧断开重建
- 证据：`Thread.tsx:578–599` effect 依赖 `blocks`（每帧换引用）→ 每秒 60 次 disconnect + new IntersectionObserver + 全量 querySelectorAll。
- 建议：依赖改 `turns.length`/id 串，observer 长存、新增 turn 增量 observe；或 MutationObserver 注册。
- 维度：性能感知

### #299 · 每帧 8+ 次全量 transcript O(n) 扫描，长会话代价线性叠加
- 证据：`activity`/`rewindIndex`/`turnStats`/`lastTurnFiles`/`bashTools`/`headerJobs`/`subagentCards`/`urlChips` 均以 `chat.items` 为输入在每次渲染重算；1000+ items 会话单帧数千次数组迭代。
- 建议：派生值折叠进 ChatState 增量维护（仿 `chat.ts` artifacts 合并）；无法增量的用 `items.length + 末项 id` 作 memo key；`groupWorkRuns` 前缀不变则复用旧 blocks。
- 维度：性能感知

### #300 · 虚拟化阈值 80 blocks 过高，且 Sidebar 会话列表完全无虚拟滚动
- 证据：`Thread.tsx:299` `VIRTUALIZE_AFTER = 80`——30–80 行的中会话（最常见卡顿区间）走全量 reconcile；`Sidebar.tsx:415–554` 普通 div 渲染全部会话行，叠加 #254 每帧重建，侧栏是最大无谓渲染面。
- 建议：阈值降到 30–40 或始终 react-window；Sidebar 行虚拟化（依赖已在）；至少先 `memo(SessionBranch)` + 稳定 props。
- 维度：性能感知 · 延续 round 2 #109

### #301 · 首屏白窗 + 665KB 单包：index.html 无启动占位、无 manualChunks、重页面全静态 import
- 证据：`<div id="root">` 空壳，冷启动到首 paint 是纯白窗口；dist 主包 665KB JS + 118KB CSS 同步阻塞；Settings/ExtensionsHub/ExtraOverlay/GitPane/MemoryWorkspace 全进主包且关闭态也参与每帧 props 构造。
- 建议：index.html 内联静态 splash/骨架；manualChunks 拆 react/marked/icons；重页面改 `React.lazy` + 按 open 条件挂载；关闭态覆盖层 props 打开时才算。
- 维度：性能感知 · 视觉

### #302 · Resizer 拖拽：每个 pointermove 走一次全树 React 渲染
- 证据：`onPointerMove` → `setSidebarWidth`（根状态）→ 高刷鼠标 120Hz+ 整树重渲染，线程所有可见行陪跑。
- 建议：拖拽期间直接写 CSS 变量（`--sidebar-w`）绕过 React，`onCommit` 时才 setState 归位（持久化逻辑已对，保留）。
- 维度：性能感知

### 组件细节与微交互

### #303 · undo-toast 库零消费者：删除会话等不可逆操作没有撤销路径
- 证据：`lib/undo-toast.ts` 已实现带撤销的 toast，但全仓无消费点；会话删除仅模态确认，误删即永久丢失（round 3 #242 讨论过撤销窗口，前提——有撤销——并不成立）。
- 建议：删除会话/丢弃改动接入 undo-toast（软删除 + 6s 撤销窗口，hover 暂停）；带 action 的 toast 生命周期延长到 ≥6s。
- 维度：微交互 · 延续 round 3 #242

### #304 · DiffView「复制新内容」按钮点击后无任何反馈
- 证据：复制成功/失败均无 toast、无图标态变化，用户只能猜。
- 建议：按钮图标瞬时切 ✓（1.2s 回弹）+ 失败 toast；全仓复制类动作统一走 `copy-help.ts` 的反馈封装。
- 维度：微交互

### #305 · ErrorBoundary「复制诊断信息」无反馈、无失败处理、缺逃生通道
- 证据：round 3 #237 要求的诊断复制已加，但复制结果无确认；clipboard 失败静默；崩溃页除"重试"外无"重载应用/打开日志"出口，重试对同一渲染错误会死循环（#238 的 key 重置是否落地需实测）。
- 建议：复制按钮加成功/失败双态；崩溃页补"重新加载窗口"主按钮与日志路径展示；重试配合递增 key 强制重挂载。
- 维度：微交互 · 延续 round 3 #237/#238

### #306 · AppModal 破坏性操作自动聚焦「确认」，Enter 即触发不可逆动作
- 证据：删除类模态打开即 focus 在危险按钮上，习惯性连按 Enter 的用户直接完成删除。
- 建议：破坏性模态初始焦点放"取消"；危险按钮需显式 Tab/点击；非破坏性模态才可聚焦主按钮。
- 维度：微交互 · 无障碍

### #307 · ChangesPanel 丢弃改动：无不可逆警示、无 loading、无结果反馈
- 证据：discard 单文件直接执行（有 confirm 但文案未列将丢失的行数/文件数）；执行期间按钮无禁用态；成功/失败无 toast。
- 建议：确认文案列"N 个文件 / +x −y 行将丢失"；按钮 pending 态；结果 toast + 失败保留现场。
- 维度：微交互

### #308 · ReviewRail 选中态与 hover 态样式完全相同
- 证据：peer tab 的 `:hover` 与 `[aria-selected]` 同底色，鼠标扫过时用户分不清当前在哪个面板。
- 建议：选中态 = 底色 + 底部 2px accent 条 + 正文色；hover 仅浅底；二者视觉可区分。
- 维度：微交互 · 视觉

### #309 · RewindDialog 无初始焦点、无焦点圈定，底层内容未隔离
- 证据：回退对话框打开后焦点留在触发处，Tab 可走到背后线程；对话框内文件列表无 roving 焦点。
- 建议：打开聚焦文件列表首项（或"取消"），trap-focus + 背景 inert；列表 ↑↓ 导航、Space 勾选。
- 维度：无障碍 · 微交互

### #310 · perm.hint 写死「按 1–4 选择」，与选项数及 QuestionCard「1–9」矛盾
- 证据：权限卡选项数可变（3–5 个），提示文案静态；QuestionCard 同类提示写 1–9，两处不一致。
- 建议：提示由选项数动态生成（`按 1–${n} 选择`），或干脆移除数字提示改用 ↑↓/Enter 描述（与 #274 的键盘模型一致）。
- 维度：文案 · 微交互

### #311 · PermissionCard 勾选「记住」后按钮语义变为常驻许可，但文案不变
- 证据：勾选 remember 后"允许"实际写入持久规则，按钮仍写"允许"——用户以为只批这一次。
- 建议：勾选后按钮文案切换为"允许并记住"；卡内一行说明将写入何处（permission rules 文件路径）。
- 维度：微交互 · 文案

### #312 · UsageStats 错误态裸展示异常字符串、加载态未复用 Skeleton
- 证据：用量拉取失败时直接把 error 字符串渲染进面板；加载中为空白而非骨架。
- 建议：错误态 = 图标 + 人话文案 + "重试"按钮；加载态复用 `Skeleton` 行（组件已存在）。
- 维度：微交互

### #313 · UsageStats 图表标题 bug：选「全部」时仍显示「近 30 天」
- 证据：时间范围切换后标题文案未跟随，数据与标题矛盾，侵蚀数据可信度。
- 建议：标题由 range state 派生（`近 7 天 / 近 30 天 / 全部`），加一条单测锁死映射。
- 维度：微交互

### 视觉观察（来自当前发布截图）

### #314 · 右上视图切换条被窗口边缘裁切：「Dashboard」变「ashboard」、「Preview」变「Pre」
- 证据：`docs/readme/preview-git.png` / `preview-dashboard.png` 中右栏 peer tab 条溢出窗口右缘，标签文字截断且无溢出指示（无 fade/滚动箭头/SpillList 收拢）。
- 建议：tab 条容器加 `overflow-x: auto` + 右侧 fade 渐变 + 溢出时收进 `…` 菜单（SpillList 已存在）；窗口窄到阈值时 peer 条自动降级为图标模式。
- 维度：视觉 · 导航

### #315 · 「始终批准」模式指示器红色斜体小字，语义错配且像调试残留
- 证据：composer 内"始终批准"以 danger 红呈现（`preview-main.png`）；红色在本应用语义中应保留给错误/破坏，而这是一个"用户主动选择的高信任模式"；08-30 checklist P0-3 已指出，仍存续。
- 建议：模式指示器改为中性强调（accent 描边 chip + 图标），danger 红仅留给 yolo 运行中的持续警示条（见 round 3 #210 的 dock 变色方案）；chip 可点击切换模式。
- 维度：视觉 · 文案 · 延续 08-30 checklist P0-3

### #316 · 整体灰阶对比过低、无强调色层级：画布/侧栏/卡片三级表面几乎同色
- 证据：发布截图中 sidebar 与 canvas 仅靠一条近乎不可见的发丝线分隔；空态画布 90% 面积无任何层级；08-30 checklist P0-8"全应用无强调色"仍基本成立（accent 仅零星出现）。
- 建议：定义三级表面 token（app/canvas/card）明暗各一套，相邻级亮度差 ≥4%；accent 限定三用途：当前选中、主行动点、运行中状态；做一次"灰度打印测试"——去掉颜色后层级仍可读。
- 维度：视觉 · 延续 08-30 checklist P0-8

---

## P2 · 中优先（29 条）

### #317 · 六种文件类型品牌色硬编码且无暗色变体，深色下 Word 蓝对比不足
- 证据：PDF/Word/Excel 等图标色为字面量，暗色主题未校准。
- 建议：品牌色入 token 表并配暗色变体（提亮 + 降饱和），图标与文字徽标共用。
- 维度：视觉

### #318 · Agent 品牌色寄生语义 token：Claude 用 `--warn`、Kimi 用 `--danger`
- 证据：agent 标识色复用语义 token，一旦 #259 调整 warn/danger，agent 品牌色被动改变；语义也被污染（Kimi = 危险红？）。
- 建议：独立 `--agent-claude/--agent-kimi/…` token 组，与语义 token 解耦。
- 维度：视觉

### #319 · 权限卡入场 `perm-pulse` 动 box-shadow（paint 属性）+ DotMatrix 数十个无限动画常驻
- 证据：`overlays.css:9–13` 脉冲用 box-shadow，权限卡面积大时掉帧可见；每个 busy 会话行 + WaitPill 各挂 16 点 infinite 动画，多会话并行时合成层压力大。
- 建议：脉冲改 transform scale + 伪元素 opacity；DotMatrix 减到 4–6 点或单元素 shimmer；两者补 prefers-reduced-motion 停动画。
- 维度：性能感知 · 视觉

### #320 · 用户消息操作栏（重发/编辑/回滚/Fork）hover-only，键盘不可达
- 证据：UserTurn 操作按钮仅 hover 显现，无焦点态显现路径。
- 建议：`:focus-within` 同显；或选中消息（键盘可达）时常驻显示操作栏。
- 维度：交互 · 无障碍

### #321 · Steer 失败降级为排队后，同一条消息在线程中出现两次
- 证据：改向失败回退 enqueue，但原消息已渲染进线程，视觉上是重复气泡，用户困惑"到底发没发"。
- 建议：降级时原气泡加"已转入队列"角标并链到 QueueStrip 对应条目，不重复渲染正文。
- 维度：交互

### #322 · 权限超时文案「已自动拒绝」与实际行为（按钮仍可点）矛盾
- 证据：90s 超时后卡面显示已拒绝，但按钮仍可点击执行允许——文案与能力不一致，信任受损。
- 建议：超时后按钮真实禁用并显示"已超时拒绝 · 重新请求"；或文案改"超时未响应"并保留一次补批机会，二选一说清楚。
- 维度：文案 · 交互

### #323 · 多权限请求 pending 时只见一张卡：无计数、无批量处理
- 证据：`usePermissionQueue` 串行展示，agent 连发 4 个请求时用户不知道后面还有 3 个，也无"全部允许同类"捷径。
- 建议：卡头显示"1 / 4 待处理"进度；提供"本会话内允许该工具"批量动作（与 #311 的 remember 打通）。
- 维度：交互

### #324 · 权限/问题 takeover 时输入框整体消失，无法自由文本回答
- 证据：QuestionCard 接管期间 composer 卸载，用户想补充上下文只能先答完卡。
- 建议：takeover 期间 composer 保留为只读 + 提示条"回答卡片后可继续输入"，或卡内提供"自由回复"折叠输入。
- 维度：交互

### #325 · 队列条目编辑=双击、排序=拖拽：关键操作全是隐形交互
- 证据：QueueStrip 无任何 affordance 提示双击可编辑、拖拽可排序；新用户不会发现。
- 建议：条目 hover 显示编辑/拖拽手柄图标；首次出现队列时给一次性 hint toast。
- 维度：微交互

### #326 · 附件列表跨会话残留：旧附件静默拼进新会话的下一条 prompt
- 证据：切换会话后 AttachStrip 未清空，用户在新会话发送时把上一个会话的附件一并发出，上下文污染且无提示。
- 建议：切换会话清空附件或按会话隔离 draft 附件；残留附件在发送前以 chip 高亮一次提醒。
- 维度：交互

### #327 · 中断成功后线程内没有任何「已停止」确认状态
- 证据：Stop 后最后一条 assistant 消息静默停笔，用户不确定是停了还是卡了。
- 建议：被中断的 turn 尾部加"已手动停止 · 用时 mm:ss"标记行（区别于自然完成与错误终止三种收尾态）。
- 维度：交互

### #328 · 视图/覆盖层状态完全不持久：设置 tab、ExtraPage、侧栏折叠态、项目展开态重启即丢
- 证据：WebuiSnapshot 无"当前视图"字段；桌面工作台用户普遍期望"重启回到离开时的样子"。
- 建议：持久化 sidebarCollapsed / openProjects / Settings 最后 tab；ExtraPage 可选恢复或启动 toast 提供"回到上次的〈视图〉"。
- 维度：导航

### #329 · 会话全文搜索是命令面板的隐藏回退，结果只显标题不显 snippet
- 证据：palette 无命中且 ≥2 字符按 Enter 才触发全文搜索；结果在侧栏 160px 平铺列表只显标题，`SessionSearchHit.snippet` 已带回却不渲染、无命中数、无高亮。
- 建议：palette 底部提示"Enter 搜索全文"；结果行渲染 snippet + 高亮匹配词 + 头部"N 个结果"。
- 维度：导航

### #330 · 归档会话可见性路径过深：漏斗 → hover 二级 flyout → 勾选，且无归档计数
- 证据：查看归档唯一入口三级隐藏；恢复只在单会话右键；自动归档天数设置又在 Settings>聊天——存与取分居两处。
- 建议：侧栏底部加"已归档 (N)"入口进归档视图（行内 unarchive/删除）；autoArchiveDays 设置就近放归档视图头部。
- 维度：导航

### #331 · 命令面板空查询时 frecency 排序打散分组，组标题重复交错
- 证据：`palette.ts:167–180` 空查询下 frecency 比较先于分组排序，"操作…会话…操作…"重复标题出现。
- 建议：空查询先按 GROUP_ORDER 分组、组内再按 frecency；或加独立"最近使用"置顶组（Raycast 模式）。
- 维度：导航

### #332 · 命令面板重复条目（hub-skills 与 hub-plugins 同 label）且缺布局类命令
- 证据：`palette.ts:37/39` 两条 label 完全相同；CORE_ACTIONS 无分屏/关窗格/切侧栏/开 Git/开预览，palette 无法替代这些鼠标路径。
- 建议：plugins label 改"插件"消歧；新增 5 个布局命令与热键共用 handler，树立"palette = 全部动作"心智。
- 维度：导航

### #333 · 侧栏列表设置 flyout 依赖 hover 开合、键盘路径断裂、定位用 `innerHeight - 400` 魔法数
- 证据：`SidebarListMenu.tsx:82–99/59–66`：Tab 移出父项即触发 leave 计时关闭子菜单；菜单高于 400px 或靠近顶边时定位失真且不翻转。
- 建议：click/Enter 主导 + hover 辅助；ArrowRight 进 / ArrowLeft 出子菜单；定位用实测高度做上下翻转。
- 维度：导航 · 无障碍

### #334 · 分屏窗格头部丢失 Git/变更上下文：无 GitChip、无 DiffSummary
- 证据：主窗格头部有分支 chip 与脏文件数，分屏叶子只有静态 cwd 文本；跨 worktree 并行时每个 pane 看不到自己绑定的分支，branchMismatch 只能事后 toast 补救。
- 建议：分屏头部按 pane cwd 查询并渲染 GitChip（分支 + dirty 数）+ 紧凑 DiffSummary。
- 维度：导航

### #335 · 危险操作确认模式三套并存（模态 / 双击武装 / 无确认），用户无法形成预期
- 证据：删除会话用模态、信任危险目录用 tapDanger、而恢复默认收件箱/重置遥测/Git checkout 脏树**无确认**——丢弃单文件反而有确认，轻重倒置。
- 建议：`lib/confirm.ts` 定规则：不可逆→模态；高频防误触→tapDanger；可逆→toast+撤销。按此补 checkout 脏树模态（列未提交文件数）与收件箱重置确认。
- 维度：交互

### #336 · 窗口标题静态 "Grok Build"：Mission Control / ⌘` 切换器里多项目无法区分
- 证据：无 `setTitle` 调用；hiddenTitle 只隐藏标题栏文字，系统级窗口标识仍同名。
- 建议：会话/项目切换时 `getCurrentWindow().setTitle(\`${title} — ${basename(cwd)} — Grok Build\`)`，无会话回落默认。
- 维度：导航

### #337 · JS `behavior: "smooth"` 滚动无视 prefers-reduced-motion（CSS 覆盖不了 JS 选项）
- 证据：`App.tsx:517/946` 与 TOC 跳转用 smooth；系统开启"减弱动态效果"的用户仍被迫看平滑滚动。
- 建议：封装 `scrollToEl(el, {smooth})`，内部读 `matchMedia("(prefers-reduced-motion: reduce)")` 决定 behavior；全仓替换裸 scrollTo。
- 维度：无障碍

### #338 · 代码预览无虚拟化：256KB 文件逐行建 DOM；查找高亮 O(tokens×matches)
- 证据：`PreviewPane.tsx:454–539` 几千行一次性挂载；`paintLine` 每 token 线性扫 matches。
- 建议：react-window 虚拟化预览行（等宽字体行高固定，成本极低）；matches 游标推进降为 O(n+m)；补 `content-visibility: auto` 兜底。
- 维度：性能感知

### #339 · Markdown 内嵌图片与 ImagineGallery 无 lazy/decoding/尺寸声明
- 证据：`media.ts` 生成的 `<img>` 无 loading/decoding/宽高，长线程图片一次性同步解码；动态行高虚拟列表中图片晚到引起行高重测与滚动跳动。
- 建议：补 `loading="lazy" decoding="async"`；可 stat 时写 width/height 或 aspect-ratio 占位；画廊固定纵横比容器。
- 维度：性能感知

### #340 · Toast 无频控/去重：stderr 风暴 = 整树重渲染风暴 + 界面抽风
- 证据：`useToast.ts` toast 在 App 根状态，每条触发整树重渲染；`useAcpSession.ts:704–706` 每行 stderr 都 showToast，agent 崩溃时秒级十几条互相顶替闪烁；单条不排队、live region 随内容挂载卸载。
- 建议：toast 移叶子层 portal 自带 store；同文案 3–5s 合并"×n"；最小间隔 300ms；stderr 按 agent+文案聚合；带 action 的 toast ≥6s 且 hover 暂停。
- 维度：性能感知 · 微交互 · 延续 round 2 #123

### #341 · QuestionCard 复用 `.permission` 警告样式：普通提问被「告警化」
- 证据：agent 的正常澄清问题与高危权限请求同视觉重量（警告底色+脉冲），用户对所有卡都紧张，真正危险的卡反而被稀释。
- 建议：QuestionCard 改中性卡（accent 左边线）；警告视觉仅保留给权限/危险类。
- 维度：视觉 · 微交互

### #342 · PlanCompleteCard 输入为空时静默代发预设文本
- 证据：用户不填任何内容按确认，卡片把内置 prompt 发出去——"我什么都没写它却替我说了话"。
- 建议：空输入时按钮文案变为"使用建议措辞继续"并 preview 将发送的文本；或要求显式选择。
- 维度：微交互 · 文案

### #343 · AccountMenu 弹出菜单无键盘导航、无焦点移交
- 证据：底部账户菜单打开后焦点不移入，↑↓ 无效，Esc 关闭不还原焦点。
- 建议：与 #292 同套 menu 键盘模型统一改造。
- 维度：无障碍 · 微交互

### #344 · 底部状态行空态用 em-dash 占位：「0%  TTFT — · — tok/s · — tok」难读且无意义
- 证据：`preview-main.png` 底栏在无数据时渲染一串破折号，信息密度为零还像乱码。
- 建议：无数据时整段隐藏或显示"等待首轮运行"；有数据才渲染指标；数字用 tabular-nums 防跳动。
- 维度：视觉 · 文案

### #345 · 无会话/分屏空态是一块纯空白：无引导、无快捷动作
- 证据：`preview-main.png` 主画布 90% 面积空白（EmptyState 只在缺 agent 等特定条件出现）；分屏新 pane 同样纯白。用户第一眼看不到"下一步能做什么"。
- 建议：空画布居中放轻引导：产品 logo 淡纹 + 三个快捷动作（新会话 / 打开项目 / ⌘K 命令）+ 最近会话 3 条；分屏空态给"选择会话"搜索框。
- 维度：视觉 · 导航

---

## P3 · 低优先（5 条）

### #346 · 骨架屏覆盖面过窄：仅会话切换一处，侧栏首屏/connecting/Git/Hub 加载均无渐进反馈
- 证据：`Skeleton.tsx` 全仓仅 `App.tsx:953–957` 一处消费；冷启动侧栏空白、connecting 只有一行 banner。
- 建议：侧栏会话区、EmptyState 主区、GitPane/Hub 首载复用 Skeleton 行；connecting 给发送按钮 progress 态。
- 维度：性能感知 · 视觉

### #347 · 图标尺寸与 icon-btn 规格不统一：14/16px 图标、22/26/32px 按钮混用
- 证据：同类操作按钮在不同面板尺寸不一，视觉节奏碎。
- 建议：定 icon 16/20 两档 + icon-btn 28/32 两档 token，全仓归一。
- 维度：视觉

### #348 · 提及/斜杠菜单用文档流布局：弹出时整个输入区向上跳
- 证据：菜单插入文档流撑高 composer，每次触发输入框位移，打字节奏被打断。
- 建议：菜单改绝对定位浮于 composer 上方（popover 层），输入区几何不变。
- 维度：交互 · 视觉

### #349 · 上翻阅读时无「N 条新消息」提示，jump-bottom 只是裸箭头
- 证据：流式期间用户上翻，新内容到达无任何提示；回底按钮无计数、无"有新内容"态。
- 建议：离底时新到达 turn 计数进 jump-bottom 胶囊（"↓ 3 条新消息"），点击清零；IntersectionObserver 复用 #298 改造后的实例。
- 维度：交互

### #350 · PreviewTabs 无方向键导航/无 aria-controls/无中键关闭，tab 多时无溢出处理
- 证据：`PreviewTabs.tsx:15–36` role=tablist 但键盘模型缺失；与 #314 的裁切问题同源（溢出无策略）。
- 建议：roving tabindex + ArrowLeft/Right + aria-controls；中键/⌘W 关闭；溢出收进 SpillList。
- 维度：无障碍 · 导航

---

## 附录 A · 维度来源统计

| 维度 | 原始条目 | 并入本轮 |
|------|---------|---------|
| 设计系统与视觉层 | 24 | 20 |
| 聊天与输入交互流 | 25 | 17 |
| 导航 / IA / 全局操作 | 25 | 20 |
| 无障碍（WCAG 2.2） | 20 | 15 |
| 性能与感知体验 | 20 | 17 |
| 组件细节与微交互 | 25 | 18 |
| 发布截图视觉核对（本轮新增） | 6 | 5 |
| **合计（去重合并后）** | **145** | **100** |

跨维度合并示例：#257 = 无障碍#1 + 聊天#4；#259 = 设计#1 + 无障碍#9；#261 = 设计#2 + 性能#11；#285 = 导航#10 + 无障碍#10 + 组件#5 + 聊天#23；#297 = 性能#6 + 聊天#17；#340 = 性能#14 + 组件#20。

## 附录 B · 与前三轮的衔接

- **延续未消化**：#251/#252/#253/#254（round 2 #107–110）、#300（round 2 #109）、#285（round 1 #55 → round 3 #218）、#282（round 3 #211）、#283（round 3 #214）、#289（round 3 #204）、#294（round 3 #249）、#303（round 3 #242）、#315/#316（08-30 checklist P0-3/P0-8）、#259（round 2 #158）。
- **已落地不重复列**：CSP/HTML sandbox/asset scope（round 1 #96–98）、ErrorBoundary 顶层（round 1 #93）、AppModal 替换 window.confirm 主体（round 1 #65）、release 打包（round 3 #220）、reduced-motion 两缺陷（round 3 #201/202）、QueueStrip 按钮拆分（round 3 #203）——本轮仅在其"未完成尾巴"上立新条目（如 #305）。
- **round 3 文末"能力已建但无消费者"模式本轮再次命中**：`undo-toast.ts`（#303）、`trap-focus.ts` 仅 1 消费（#290）、`Skeleton.tsx` 仅 1 消费（#346）、`SpillList` 未用于溢出 tab（#314/#350）。建议立一条 lint/测试：导出即须有消费点。

## 附录 C · 验证缺口（静态审查，需实测复核）

1. #251–#255、#297–#302 的帧耗时需 DevTools Performance 实测（构造 1000+ items 会话 + 流式输出）。
2. #314 的裁切需在不同窗口宽度（1024/1280/1568）复现截图确认阈值。
3. #260/#288/#291 需 VoiceOver / NVVS 实机走查一遍权限流与菜单流。
4. #282 的 Escape 叠加需"预览打开 + 回合运行中"组合实测。
5. #305 的重试死循环需构造必崩子树验证 key 重置是否已落地。

## 推进建议（如果只做五件事）

1. **#251–#255 性能五连**：这是 round 2 就确诊、至今未动的核心病灶；做完长会话体验质变，且 #297–#302 是其顺势清理。
2. **#257 + #287 + #274 菜单族键盘化**：一个 `useMenuKeyboard` hook 同时修提及/斜杠/权限三处，投入小、阻断级收益。
3. **#258 死 UI 清理**：要么接通要么下架，展示永久禁用的按钮比没有该功能更伤信任。
4. **#259 + #289 + #293 对比度三件套**：语义色文字化、焦点环、faint 小字，一次 token 手术解决一类 WCAG 违规。
5. **#278 + #314 命名与溢出**：右栏是信息架构混乱的震中（一词三义 + 裁切 + 双层 tablist），重命名 + 溢出策略一次做完。
