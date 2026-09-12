# Grok Build Desktop · 前端设计优化方案 v2 —「Graphite / 石墨工作台」

高保真 HTML 原型 + 设计说明。数据为模拟，不连 CLI。

打开方式：

```bash
python3 -m http.server 4174 --directory docs/redesign-graphite
# 浏览器访问 http://127.0.0.1:4174/
```

或直接打开 `docs/redesign-graphite/index.html`。

原型里可交互的点：

- 左下角 ☾/☀ 切换明暗主题
- ⌘K / 点击搜索框打开命令面板，Esc 关闭
- 侧栏会话可点选；项目分组可折叠
- 对话区 Run 时间线可逐条展开收起
- 许可卡按钮（批准一次 / 始终批准 / 拒绝）触发 toast
- 右侧审阅栏 segmented tabs 可切换
- 输入栏底部 Agent / Plan / 模型 / 工作量 chips 有下拉菜单
- 右上角齿轮打开设置弹窗

---

## 1. 现状诊断

| # | 问题 | 依据 |
|---|------|------|
| 1 | **色相打架**：default 主题是暖米白底（hsl 30），accent 却是冷蓝（hsl 207），两者在同一屏里互相抢戏 | `src/styles/tokens.css` |
| 2 | **主题族膨胀**：default / paper / ink / frost × 明暗 = 8 套组合，111 个 token，每加一个组件要在 4 个族里各调一遍 | `tokens.css`、frost 移植 spec |
| 3 | **状态色不成体系**：`--warn` 是土黄 `rgb(224,205,99)`，ok/warn/danger 跨主题亮度不一致，运行/等待/断连没有统一语义 | `tokens.css`、REVIEW.md |
| 4 | **层级靠猜**：`--bg` 与 `--bg-side` 明度差 ~2%，分组标题用 `--faint`，扫视时分区消失（REVIEW #5 已记录） | `sidebar.css`、REVIEW.md |
| 5 | **阴影被滥用**：静态面板也用投影，投影应该只留给真正的悬浮层（palette / dialog / toast） | frost spec 第 4 节已提出同样方向 |
| 6 | **工具调用是散卡**：每个 tool call 独立卡片，看不出它们属于同一次 run、耗时和先后关系 | `thread.css` |
| 7 | **许可卡不够"行动"**：弱强调色底 + 一排同级按钮，用户要决策时找不到主按钮 | `thread.css`、REVIEW.md |
| 8 | **空态只说"没有"**：REVIEW #3 已整改文案，但视觉上仍是无图纯文字，没有品牌感 | `EmptyState.tsx` |

## 2. 设计目标

- **Calm, not blank**：减少装饰色，把"颜色预算"留给状态（运行中、等待许可、失败）。
- **一屏一职**：侧栏=导航，对话列=阅读，审阅栏=查证，输入栏=行动。每屏只有一个主按钮。
- **层级靠线与明度，不靠阴影**：静态分区用 1px 线与明度差；阴影只给悬浮层。
- **主题收敛**：不做第 5 个主题族，而是把 token 体系收敛成"中性底 + 墨色 CTA + 信号蓝 accent"一套骨架，明暗两态。现有主题族可作为 flavor 保留，但新组件只消费骨架 token。

## 3. Token 方案（新骨架）

### Light

| Token | 值 | 说明 |
|---|---|---|
| `--bg` | `hsl(220 10% 98%)` | 内容底，去暖化中性灰 |
| `--bg-side` | `hsl(220 10% 96%)` | 侧栏底，与内容差 2% + 1px 线 |
| `--bg-card` | `hsl(0 0% 100%)` | 卡片/输入面 |
| `--bg-sunk` | `hsl(220 10% 95%)` | 凹陷面（代码块、field） |
| `--line` | `hsl(220 10% 90%)` | 唯一分隔线色 |
| `--text` | `hsl(222 15% 13%)` | 近黑墨色 |
| `--muted` | `hsl(220 8% 44%)` | 次级（对比度 ≥ 4.5） |
| `--faint` | `hsl(220 8% 60%)` | 只给 placeholder/装饰 |
| `--accent` | `hsl(222 89% 56%)` | 信号蓝：链接、聚焦、进行中 |
| `--cta` | `hsl(222 15% 13%)` | 墨色主按钮 |
| `--ok` `--warn` `--danger` `--info` | oklch 等亮度四色 | 语义状态 |

### Dark

| Token | 值 |
|---|---|
| `--bg` | `hsl(222 12% 8.5%)` |
| `--bg-side` | `hsl(222 12% 7%)` |
| `--bg-card` | `hsl(222 11% 11.5%)` |
| `--text` | `hsl(220 10% 95%)` |
| `--accent` | `hsl(217 95% 68%)` |
| `--cta` | `hsl(220 10% 95%)`（反转为浅色按钮） |

完整 token 见 `styles.css` 顶部 `:root` 与 `[data-theme="dark"]` 两块。

### 字号阶

`--micro: 11px`（辅助/时间戳）→ `--small: 13px`（侧栏/芯片）→ `--body: 14.5px`（UI 正文）→ `--md: 15.5px`（serif 对话）→ `--title: 17px`（标题）。对话正文保留 Source Serif，`tabular-nums` 用于 token/耗时数字。

## 4. 组件级改动

| 区域 | 现状 | 方案 |
|---|---|---|
| 侧栏 | 会话行只有标题 | 行 = 状态点 + 标题 + `相对时间 · 模型` 小字行；选中态为 accent 8% 底 + 左 2px 指示条 |
| 侧栏分区 | `--faint` 标题 | 11px micro label，0.08em 字距，`--muted` |
| 对话区 | tool call 散卡 | **Run 时间线**：一次 run 一个容器，左侧竖线串联工具，行内图标表类型（read/edit/bash），右侧耗时 + 状态色 |
| 许可卡 | 弱底色 + 同级按钮 | 卡片左缘 3px accent 条；主按钮墨色「批准一次」，次按钮「始终批准」，拒绝为文本按钮 |
| 输入栏 | 圆角卡片 | 聚焦时 2px accent 环；chips 统一胶囊；发送键墨色，运行中变 stop |
| 运行状态 | 零散 status-dot | 输入栏上方一条 `run-strip`：状态点 + 阶段 + 已用时间 + token/s，tabular-nums |
| 审阅栏 | 顶部 6 个标签 | segmented control 四段（进度/改动/文件/上下文），无数据的段自动隐藏 |
| 空态 | 纯文字 | 点阵画布（16px dot grid）+ serif 标题 + 一个墨色主按钮 |
| Toast | 右下卡片 | 底部居中 pill，墨色底白字，动作按钮用 accent |

## 5. 动效

- 消息入场 rise-in（transform+opacity, 240ms, `--ease`）
- 流式输出末端块状光标（step 闪烁，结束即移除）
- Run 展开用 `grid-template-rows: 0fr→1fr`，chevron 旋转
- 全部包 `@media (prefers-reduced-motion: reduce)` 降级（沿用现有策略）

## 6. 落地路径

不推翻 `src/styles/` 分层，分三步：

1. `tokens.css` 增加新骨架值（可在现有 4 族之外新增 `graphite` 族，或直接改 default——建议后者，收敛而非再加一族）
2. `sidebar.css / thread.css / composer.css / review.css` 按本原型的类名与结构逐步对齐；Run 时间线对应 `Thread`/`WorkTimeline` 的容器改造
3. 旧主题族 paper/ink/frost 保留为 flavor；视觉 QA 只回归 graphite 明暗两态 + 其余族 smoke
