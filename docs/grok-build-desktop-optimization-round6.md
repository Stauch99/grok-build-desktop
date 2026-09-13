# Grok Build Desktop 优化参考文档（Round 6 · 50 条升级点 + 体感筛选）

- 日期：2026-09-13
- 基线：`main` @ v0.6.5（typecheck 0 错误，245 测试文件 / 2039 测试全绿）
- 方法：对照 round5 基线逐条核销（绝大多数已落地），再以「日活用户的一天」为线索重新审视全产品面：启动 → 选会话 → 读线程 → 写 prompt → 看工具 → 审 diff → 管 git → 看板/记忆/扩展。
- 体感强弱：★☆☆ 微弱 → ★★★ 强（每天高频撞上）
- 「本迭代实施」= 体感明确且可在本轮落地的项（38 条）

---

## P0（12 条）

**1. 线程内查找（Cmd/Ctrl+F）** — 本迭代实施
- 现状：全局搜索 `searchSessionText` 只能定位到会话，进入会话后无法再定位到具体一条消息。
- 方案：每个 pane 内 Cmd+F 弹出查找条（命中计数、↑/↓ 跳项、Esc 关闭、高亮当前命中），复用 `search-highlight.ts` 与现有 jumpId 高亮机制。
- 体感：★★★（长会话里找一条命令/路径是日常刚需）

**2. 代码块工具条：语言标签 + 一键复制** — 本迭代实施
- 现状：Markdown 渲染的代码块没有复制按钮，只能手动划选。
- 方案：`Markdown.tsx` 为每个 fenced block 注入头部（语言名 + copy 图标 + 已复制反馈），流式尾部块跳过。
- 体感：★★★

**3. 图片灯箱** — 本迭代实施
- 现状：线程与附件里的图片点击无放大预览。
- 方案：点击 → 全屏灯箱（Esc/点击背景关闭，多张可 ←→ 翻页，显示文件名）。
- 体感：★★☆

**4. 大段粘贴守卫** — 本迭代实施
- 现状：粘贴 200 行日志直接糊进输入框，无法转附件。
- 方案：粘贴文本 >30 行或 >4000 字符时弹条：「作为 .txt 附件发送 / 仍粘贴进输入框」，默认前者；附件走既有 ingest 通道。
- 体感：★★★

**5. 覆盖层焦点圈定与焦点归还** — 本迭代实施
- 现状：仅 CommandPalette 有 `trapFocus`；AppModal / SessionMenu / JobsMenu / MenuSelect / MillerPicker 焦点可逃逸到背景，关闭后焦点丢失。
- 方案：统一复用 `lib/trap-focus.ts`，打开时圈定 + 初始焦点，关闭归还触发钮。
- 体感：★★☆（键盘/读屏用户是 ★★★）

**6. PreviewPane Escape 分层** — 本迭代实施
- 现状：pane 内按 Esc 直接关整个预览。
- 方案：Esc 优先级 = 关查找条 → 关当前 tab → 最后关预览。
- 体感：★★☆

**7. 消息右键上下文菜单** — 本迭代实施
- 现状：消息操作只有 hover 的复制/编辑钮，发现性差。
- 方案：assistant/user 消息右键 → 复制 / 复制为 Markdown / 引用到输入框 / 从此回退（复用现有 rewind affordance）/ 分支。
- 体感：★★★

**8. 用户消息间跳转** — 本迭代实施
- 现状：长会话里回到「我上上条说了什么」只能滚。
- 方案：Alt+↑/↓ 在 user turn 间跳跃 + 高亮；滚动条侧可加 tick 标记（可选）。
- 体感：★★☆

**9. 长工具输出折叠** — 本迭代实施
- 现状：长 bash 输出/文件读取整块撑开线程。
- 方案：>12 行自动折叠为摘要行（命令 + 行数徽标），点击展开；正在流式的不折叠。
- 体感：★★★

**10. Composer token 估算** — 本迭代实施
- 现状：发出去之前不知道这段 prompt 多大。
- 方案：输入超过阈值（~2000 字符）时 chip 显示估算 tokens（chars/4 启发式 + 附件计数），接近模型上下文时变色。
- 体感：★★☆

**11. 通知中心** — 本迭代实施
- 现状：OS 通知一闪而过，dock 徽标只有总数；错过就找不到。
- 方案：头部铃铛 → 最近 20 条「needs-you / done / error」事件列表（会话名 + 时间 + 点击跳转 + 全部清除）。
- 体感：★★★（多会话并行必备）

**12. i18n 债务清零：lib 层 ~45 文件硬编码中文** — 本迭代实施
- 现状：`run-status.ts`、`session-status.ts`、`stall.ts`、`sidebar-list.ts`、`tool-render.ts`、`work-run-copy.ts` 等 lib 层仍硬编码中文，英文模式下照显中文。
- 方案：纯函数层改为接收 `t`/`locale` 或返回 key 由组件层翻译；补 i18n 键（zh+en 对齐）。
- 体感：★★★（英文用户）

## P1（24 条）

**13. 快捷键速查表覆盖层（Cmd+/ 或 ?）** — 本迭代实施
- 现状：快捷键只能去设置页翻。
- 方案：新 `ShortcutsOverlay`（分组列表 + 当前自定义绑定），复用 `shortcuts-table.ts` 单一事实源。
- 体感：★★☆

**14. Zen/专注模式** — 本迭代实施
- 现状：侧栏、右栏、统计行始终占位。
- 方案：Cmd/Ctrl+. 一键收起 sidebar + review rail + stats，再按恢复；状态入持久化偏好。
- 体感：★★☆

**15. Cmd/Ctrl+L 聚焦输入框** — 本迭代实施
- 现状：从任何地方回到输入要伸手抓鼠标。
- 方案：全局快捷键聚焦当前聚焦 pane 的 composer。
- 体感：★★★

**16. 字号快捷键 Cmd+= / Cmd+- / Cmd+0** — 本迭代实施
- 现状：`chatFontSize` 只有设置页预设档。
- 方案：快捷键在预设档间步进/复位，toast 显示当前字号。
- 体感：★★☆

**17. 「需要你」侧栏筛选** — 本迭代实施
- 现状：needs-you 会话散在各项目组里。
- 方案：侧栏顶部筛选 chip（全部 / 需要你 / 运行中），复用 `deriveStatus`。
- 体感：★★★

**18. 会话标记未读** — 本迭代实施
- 现状：unread 只能被「自动标记 → 打开清除」，看完想稍后处理没有手段。
- 方案：SessionMenu 加「标记未读」，写回 `unread` 映射（session-status.ts 已有结构）。
- 体感：★★☆

**19. 会话级通知静音** — 本迭代实施
- 现状：通知开关是全局的，某个刷屏会话没法单独静音。
- 方案：SessionMenu「静音通知」，持久化 muted 集合；发通知前检查。
- 体感：★★☆

**20. 每文件选择性回退** — 本迭代实施
- 现状：RewindDialog 是全量 plan + 输入确认短语，想只回退一个文件做不到。
- 方案：预览行加勾选（默认全选），只对勾选文件执行 restore。
- 体感：★★★

**21. Git 单文件 stage / unstage** — 本迭代实施
- 现状：只有 commit（全部）与 discard，不能挑选文件进 commit。
- 方案：changes 列表每行加 stage/unstage 钮（Rust 侧补 `git_stage`/`git_unstage` 走既有 runGit 通道），commit 只提交已暂存。
- 体感：★★★

**22. 让 agent 起草 commit message** — 本迭代实施
- 现状：commit 输入框全手写。
- 方案：「让 agent 起草」钮 → 通过 composer-inbox 往输入框注入 prompt（如「根据 staged diff 写 commit message」）。
- 体感：★★☆

**23. DiffView 统一/分屏切换** — 本迭代实施
- 现状：只有 unified 视图。
- 方案：side-by-side 渲染模式 + 视图切换钮，偏好入持久化。
- 体感：★★☆

**24. Diff「就这一行问 agent」** — 本迭代实施
- 现状：审 diff 发现问题要手抄行号再描述给 agent。
- 方案：diff 行 hover 出现「问 agent」钮 → 引用该行（文件+行号+内容）注入 composer-inbox。
- 体感：★★★

**25. 会话便签** — 本迭代实施
- 现状：跨会话记不住「这个会话在验证什么」。
- 方案：SessionMenu「便签」→ 小弹层编辑，按 sessionId 存 localStorage，侧栏行 hover 显示首行。
- 体感：★★☆

**26. Prompt 片段库** — 本迭代实施
- 现状：常用 prompt（如「跑测试并修红」）每次重打。
- 方案：设置页管理片段（标题+正文），composer 加片段选择钮或 `/snip` 触发，选中即填入。
- 体感：★★☆

**27. FileTree → composer 拖拽附加** — 本迭代实施
- 现状：附加文件只能 @ 提及或拖外部文件。
- 方案：FileTree 行 draggable（dragstart 写 path），composer drop 识别并走 attach 通道。
- 体感：★★☆

**28. PreviewPane console 错误捕获** — 本迭代实施
- 现状：HTML artifact 在 iframe 里报错用户看不见。
- 方案：srcdoc 注入 error 捕获脚本 → postMessage 到宿主 → 预览头部错误徽标 +「复制错误/发给 agent」。
- 体感：★★☆

**29. PreviewPane 在浏览器打开** — 本迭代实施
- 现状：只能在内嵌 iframe 看。
- 方案：对 HTML artifact 提供「在浏览器打开」（复用 `open_path`）。
- 体感：★☆☆

**30. 头部显示会话时长与 token 总计** — 本迭代实施
- 现状：用量只在 UsageRing 百分比。
- 方案：pane 头部/统计行 tooltip 展示「会话总 tokens · 已用时」。
- 体感：★☆☆

**31. 启动恢复上次会话** — 本迭代实施
- 现状：重启后回到空工作台或收件箱。
- 方案：设置项「启动时恢复上次会话」：持久化 focusedSessionId，启动时若会话仍存在则自动打开。
- 体感：★★☆

**32. What's-new 覆盖层** — 本迭代实施
- 现状：升级后用户不知道变了什么。
- 方案：版本号变化时首次启动弹「新功能」卡（读 CHANGELOG 最新段 + 静态要点列表 + 不再显示）。
- 体感：★☆☆

**33. 项目拖拽排序** — 本迭代实施
- 现状：项目组/项目顺序固定按最近活动。
- 方案：侧栏项目行支持拖拽排序，顺序持久化。
- 体感：★☆☆

**34. 侧栏密度切换** — 本迭代实施
- 现状：行高固定。
- 方案：设置项 舒适/紧凑 两档，CSS 变量驱动行高。
- 体感：★☆☆

**35. 记忆页全文搜索** — 本迭代实施
- 现状：日记/USER.md 只能滚着找。
- 方案：记忆页搜索框，命中高亮 + 跳条目。
- 体感：★☆☆

**36. 会话复制** — 本迭代实施
- 现状：想「再来一遍微调 prompt」要新建会话重打。
- 方案：SessionMenu「复制会话」→ 同 cwd 新建会话并把首条用户消息放入草稿。
- 体感：★☆☆

## P2（14 条 · 记录在案，本轮不实施）

37. 广播对比模式（同一 prompt 发多 agent 分屏对比）——需要多会话编排设计，动架构。
38. 托盘菜单快捷动作（新会话/最近会话）——平台差异大。
39. CLI 版本过旧提示——缺版本元数据来源。
40. 高对比主题档——需要新令牌组。
41. 会话颜色标签——侧栏视觉噪音 vs 收益待验证。
42. 周报导出（dashboard → markdown）。
43. Imagine 画廊管理（删除/打开所在目录/重新生成）。
44. auto-compact 阈值用户自定义。
45. turn 计时甘特时间线视图。
46. 中键点击会话行直接分屏打开。
47. Dashboard 每 agent 用量对比图。
48. 离线/断网状态指示。
49. 已归档会话批量清理页。
50. OSS 元数据补齐（license/repository 字段、CHANGELOG 回填）。

---

## 体感筛选结论

38 条进入本迭代实施（上文标注「本迭代实施」）：P0 全部 12 条 + P1 全部 24 条 + 看板卡片悬停预览（合并入 #17 筛选面一并做，见下）。

P2 的 12 条暂缓：要么动架构（#37 广播）、要么缺依赖（#39 版本源）、要么体感弱且需设计验证（#41 颜色标签）。已记录待下轮评审。

## 实施批次（subagent driven）

| 批次 | 代理 | 范围 | 文件所有权 |
| --- | --- | --- | --- |
| W1 | A 线程面 | #1 #2 #3 #7 #8 #9 + 复制为MD | Thread/UserTurn/Markdown/BashCommandRow + thread.css + 新 lib |
| W1 | B 输入区 | #4 #10 #26 #27 + composer-inbox | Composer/AttachStrip/FileTree(dragstart) + composer.css + 新 lib |
| W1 | C 侧栏/看板/记忆 | #17 #33 #34 #35 + 看板悬停预览 | Sidebar/Dashboard*/MemoryGrowthPage + project-groups + sidebar.css |
| W2 | D 覆盖层/App接线 | #5 #6 #11 #13 #14 #15 #16 #28 #29 #30 #32 | App.tsx + AppModal/JobsMenu/MenuSelect/MillerPicker/PreviewPane + overlays.css |
| W2 | E Git/审阅 | #20 #21 #22 #23 #24 | GitBar/GitPane/GitHistory/DiffView/RewindDialog + checkpoint + api.ts(git) + src-tauri git 命令 |
| W3 | F 会话菜单 | #18 #19 #25 #36 #31 | App.tsx + SessionMenu + session-status + 新 lib（便签） |
| W3 | G i18n | #12 | 其余含硬编码中文的 lib 文件（排除 F 所有） |

约束：同一波内文件所有权不相交；跨波串行；每批完成须 `npm run typecheck` + `npm test` 全绿；UI 图标只经 `src/icons.tsx`（Tabler）；文案一律走 `t()` 双语。

---

## 实施结果（2026-09-13 全部完成）

38 条「本迭代实施」项已由 7 个 subagent 分三波全部落地。最终验收：`tsc --noEmit` 0 错误；vitest 262 文件 / 2133 用例全绿（净增 +17 文件 / +94 用例）；cargo test 263 全绿（含新增 git_stage/git_unstage/staged-commit 用例）。变更规模：77 文件修改 + 约 30 个新文件，+3948/−364 行。

实施备注：
- #4 粘贴守卫走了完整路径（`savePasteBytes` 真附件，非占位方案）。
- #11 通知中心经 `useAppModelEffects` 旁路记录（needs-you/done/error + 权限等待），#19 静音同步门控 OS 通知/通知中心/dock 徽标。
- #20 选择性回退：`filterPlan` 过滤执行链，勾选状态实时刷新 describePlan 摘要。
- #21 stage/unstage：porcelain X 列上屏 `GitChange.staged`；`git_commit` 智能分流（有暂存则不加 -A）。
- #12 i18n：20 个 lib 文件转换、新增 50 键 ×2；跳过项均核实为匹配器/提示词/死字段。唯一边界修正：`projects.ts` 的「未命名会话」显示兜底本地化。
- #28 预览 console 探针：sha256 锁定注入脚本 + CSP 收紧（产物脚本仍被沙箱挡），有同步守卫测试。
