# Grok Build Desktop · 优化建议 第二轮（round 2）

> 版本：0.4.0 review · 日期：2026-08-30
> 前置：第一轮建议（`docs/grok-build-desktop-optimization.md`）中的 #97 CSP、#96 asset scope、#98 HTML sandbox、#66 O_NOFOLLOW、#89 config 写锁、#61 App 拆分、#42 agent 预热、#43 增量分页、#45 watch 事件、#93 ErrorBoundary、#65 AppModal 等已在当前代码中落地。
> 本清单聚焦第一轮未覆盖，或重构后新引入的问题。

## 判定标准

| 级别 | 判定 |
|------|------|
| **P0** | 安全漏洞 / 数据完整性风险，发布前必须修 |
| **P1** | 核心体验痛点 + 明显性能瓶颈 + 高价值安全面，下版应做 |
| **P2** | 有价值但不紧急，中期排期 |
| **P3** | 锦上添花 / 可选，证明有需求再投入 |

---

## P0 · 阻断级（4 条）

| # | 建议 | 理由 |
|---|------|------|
| 101 | **`write_config_text` 仍无并发写锁**——`patch_cli_settings` 与 `write_config_text` 都可能同时写 `config.toml`，读-改-写丢字段 | 前端 `Settings` 与 `ExtensionsHub` 都写同一文件；快速切换设置会并发，导致配置损坏。需单一写锁（Mutex）或先读后 CAS 再写。 |
| 102 | **`send_raw` 对 RPC 方法无白名单校验**——前端可发任意 JSON-RPC 到 grok stdin | ACP bridge 允许 `send_raw` 透传任意方法；`grok_args_allowed` 只是 CLI 命令白名单，`session/prompt` 等 RPC 方法未限制。需限制可发送方法集。 |
| 103 | **`import_dropped_file_to` 用 `std::fs::read` 全量读** | 大文件（接近 `ATTACHMENT_BYTE_CAP`）一次性读入内存再写，属可规避的内存峰值。应 `std::fs::copy` / 流式拷贝，而非 `read + write`。 |
| 104 | **`decode_session_cwd` / `decode_file_url` 的 `%` 解码可产生非法路径组件** | 手工 `%XX` 解码无边界校验，编码出 `/` 或 `..` 可拼出穿越路径（最终 `is_under` 会拦，但应在解码前拒绝 `%2F`/`%2e`），防御性收紧。 |

---

## P1 · 高优先（24 条）

### 性能与架构

| # | 建议 | 理由 |
|---|------|------|
| 105 | **`useAppModel.ts`（1860 行）仍超 800 上限，继续拆分** | `App.tsx` 已拆干净，但状态几乎全上移到这个巨型 hook。建议裂成 `useAppState`（纯状态）+ `useAppDerivations`（memo 派生）+ `useAppActions`（命令）。 |
| 106 | **`acp-events.ts` 的 union 结尾 `[k: string]: unknown` 使其失去 discrimination** | 费心建的类型因兜底 index signature 形同 `any`，`applyChatUpdate` 里仍靠 `String(update.sessionUpdate)` 手动区分。应让 `update` 成为真正的 discriminated union 并收窄。 |
| 107 | **`handleRpcMessage` 仍全量 in-place 处理每条 ACP 消息** | 增了增量分页，但每条 `session/update` 都 `setChat` 触发全列表重渲染 + `groupWorkRuns` 重算。长会话每 token 一次全量重排。需批量 setState（flush 合并）/ 只更新受影响 block。 |
| 108 | **`ThreadColumn` 内 `groupWorkRuns(chat.items)` 每次渲染全量重算** | 没有 `useMemo`。长会话每次 token 到达都 O(n) 重组，以 `items.length` 为 key 缓存。 |
| 109 | **长会话一次性渲染全部 `ChatRow`，无虚拟化** | 分页解决数据加载，但 DOM 仍全量。上千条消息 DOM 节点过多。需 `react-window` / `react-virtuoso`。 |
| 110 | **`ChatRow` / `Markdown` 未 memo** | 每条消息独立 markdown parse + render，长列表是重渲染大头。`React.memo` + 内容级缓存（确认 `markdown-cache.ts` 接入）。 |
| 111 | **`useAppModel` 的 `useEffect` 依赖数组引用不稳定值** | 多数 `useCallback` 用 `[]` 或 `[cwd]`，内部调用 `setChat`/`persist` 等，导致 `refreshGit`/`sendPrompt` 等重建，`useEffect` 反复触发。需全链 `useCallback` 稳定。 |
| 112 | **`watch_workspace` 成功后无降级校验** | 监听文件系统事件，若 watch 失效（目录被移走 / 事件丢失）静默不刷新，用户看到过期 diff。应定期（如 30s）兜底 `workspaceMtime` 校验。 |

### 会话 / 审阅

| # | 建议 | 理由 |
|---|------|------|
| 113 | **`PreviewPane` 加了 `tabs` 但切换 tab 会导致编辑草稿丢失** | 多标签预览已做，但 `draft` reset 依赖 `[path]`，切走再切回，**编辑中的草稿会丢**。需 per-tab draft 缓存。 |
| 114 | **预览编辑保存无乐观反馈** | `onSave` 里 `writeAllowedText` 成功后才 `setPreviewText`，失败无 toast 回滚。体验是"点了没反应"。应加 pending 状态 + 失败还原。 |
| 115 | **`ReviewRail` changes tab 每次打开都全量拉 git log/branches** | `useGitWatcher` 的 `historyKey: reviewTab` 每次切 tab 都 `gitLog` + `gitBranches`。切 tab 频繁会抖动，应缓存历史。 |
| 116 | **`FilePanel`/`PreviewPane` 路径点击缺少 `//` 规范化** | `relativeTo`/`resolveOpenTarget` 拼接路径对 `../` 与重复 `/` 不统一，点击产生错误路径。需统一 `joinSafe`。 |

### Git / 文件

| # | 建议 | 理由 |
|---|------|------|
| 117 | **Git 改动列表仍无"丢弃/还原单个文件"** | `git_changes` 列出改动，`RewindDialog` 只能整段 rewind。高频需求是 ChangesPanel 单文件 discard。 |
| 118 | **未跟踪文件 `git_changes` 只给行数，不给内容** | 未跟踪文件 added 数有了，但无法查看内容/预览。ChangesPanel 应支持点击未跟踪文件查看。 |
| 119 | **`git_create_worktree` 不同步 git 分支** | 创建 worktree 后未切分支/记录当前分支，会话与 worktree 关联不清晰。应返回 branch 并显示在 GitBar。 |
| 120 | **工作区变更后 `commits`/`branches` 未从 `workspace-changed` 事件刷新** | `useGitWatcher` 的 `onTouched` 只刷新 `git`+`changes`，`GitHistory` 的 commits/branches 不刷新，提交后历史列表滞后。 |

### 通知 / 状态

| # | 建议 | 理由 |
|---|------|------|
| 121 | **`PERMISSION_TIMEOUT_MS = 90s` 全局硬编码** | 长工具（构建/测试）跑 90s 会被默认拒绝，误杀正常任务。应按工具类型 / 延迟动态延长。 |
| 122 | **`unread` badge 只计 `done`/`error`，无"需要你"语义区分** | `setBadge(countNeedsYou(...))` 已做，但 `unread` map 混合 `done`/`error`，badge 无法精细表达状态。应拆分 `needsAttention` 状态。 |
| 123 | **`showToast` 多个 `setTimeout` 并存，无防重** | 多处 `setTimeout(() => setToast(null), 2800)` 独立调度，互相覆盖/提前收起。应集中 toast 队列。 |

### 国际化 / 可达性

| # | 建议 | 理由 |
|---|------|------|
| 124 | **i18n 仍 ~45 key，UI 大量硬编码中文字符串** | `i18n.ts` 扩展了，但 `Settings`/`App`/`Composer` 里 `"设置"`、`"独立对话"`、`"重命名"` 仍硬编码。英文 locale 仍不完整。 |
| 125 | **`aria-live` 只在 WaitPill，消息流无 live region** | 流式输出对 screen reader 不可达。应在 thread 容器 / work 活动区加 `aria-live="polite"`。 |
| 126 | **快捷键冲突无检测** | `shortcuts-table` 定义了默认绑定，但用户自定义与系统 / 全局快捷键冲突时无提示（如 ⌘K 被系统占用）。 |

### 数据 / 用量

| # | 建议 | 理由 |
|---|------|------|
| 127 | **`costTicks` 未按模型分摊** | `token_turn_from_record` 取 `modelUsage` 的 key，但 cost 是全局 tick，无法看哪个模型贵。应拆 `model`→cost。 |
| 128 | **`read_token_turns` / `read_usage_history` 每次调用全文扫 `updates.jsonl`** | 即便有增量分页，`read_usage_history` 仍全量读 `signals.json` / `updates.jsonl`，多会话开销大。需缓存 / 索引。 |

---

## P2 · 中优先（45 条）

| # | 建议 |
|---|------|
| 129 | 会话列表批量操作（删除 / 归档 / 标记已读，Shift/Cmd 多选） |
| 130 | 会话大纲 / 导航地图（不只是 toc tick） |
| 131 | 会话导出为文件（MD/JSON）并支持导入恢复 |
| 132 | 会话模板（预填 plan / Prompt） |
| 133 | 无会话 compose 草稿持久化（重开 app 丢失） |
| 134 | 跨项目聚合的"全局仪表盘" |
| 135 | 会话"对比"功能（同项目两会话） |
| 136 | 会话 Pin 到底部（现在仍只有置顶） |
| 137 | 侧栏行内双击标题重命名（现在要进 SessionMenu） |
| 138 | 预览源码语法高亮（现在纯 `<pre>`） |
| 139 | 预览源码行号 |
| 140 | 预览 Ctrl+F 查找 / 高亮（`preview-find.ts` 已存在，确认接入） |
| 141 | 图片预览缩放 / 平移（image media 固定大小） |
| 142 | 视频预览自定义倍速 / 进度 |
| 143 | 预览多标签 tab 草稿缓存（接 #113） |
| 144 | 命令面板 frecency 排序（`frecency.ts` 已存在，确认接入） |
| 145 | 命令面板箭头键导航 + 回车可达性 |
| 146 | `@` 引用可选"附带文件内容" |
| 147 | 斜杠命令历史排序（最近使用优先） |
| 148 | 粘贴为纯文本（Cmd+Shift+V） |
| 149 | 输入框 Markdown 快捷栏 |
| 150 | 拖拽文件到侧栏某会话 |
| 151 | 权限卡"此会话内记住该工具" |
| 152 | 权限超时默认拒绝加"允许当前调用"选项 |
| 153 | 信任目录二次确认（尤其危险目录） |
| 154 | 用量统计加时间序列图（轻量毫线图） |
| 155 | 用量"今日 / 本周 / 本月"快捷视图 |
| 156 | 自动压缩前后 token 差说明 |
| 157 | 中西文混排字体栈优化 |
| 158 | 浅色模式颜色对比度 AA audit |
| 159 | CommandPalette / 菜单 / 预览 focus trap 与焦点归还 |
| 160 | 会话列表 Tab 遍历顺序 + aria 分组 audit |
| 161 | ErrorBoundary 覆盖到非顶层（组件级 fallback） |
| 162 | `.gitignore` 补充（`tsconfig.tsbuildinfo`、`dist`、打包产物）——确认部分已做，可能有遗漏 |
| 163 | `open_in_terminal` 跨平台（当前仅 macOS Terminal.app） |
| 164 | `write_config_text` 2MB 上限收紧到 ~512KB |
| 165 | 附件路径后端校验（存在性 + 大小 + 允许范围） |
| 166 | 文件读写审计日志 |
| 167 | 会话标题为空时显示首条消息片段 |
| 168 | `useReviewController` 切换会话时 abort + memo |
| 169 | 所有 `setInterval` / `setTimeout` cleanup 审计 |
| 170 | 连接状态切换（发送中 / 未连接）加 smooth 过渡 |
| 171 | `webui.json` 写节流已做，但需确认写前 diff |
| 172 | Mermaid 懒加载 + 渲染缓存（`mermaid-once.ts` 已存在，确认接入） |
| 173 | `search_session_text` 先 title 命中再读 body |

---

## P3 · 低优先（27 条）

| # | 建议 |
|---|------|
| 174 | Git blame / 行级历史 |
| 175 | Git 冲突解决视图 |
| 176 | 改动导出为 `.patch` |
| 177 | worktree 会话自动清理无效路径 |
| 178 | git 分支切换检测并提示会话关联 |
| 179 | 会话固定到托盘 |
| 180 | 会话自动摘要（生成对话回顾） |
| 181 | 会话"重新生成最后一轮" |
| 182 | 会话搜索时段过滤 |
| 183 | 主题"自动跟随系统"（当前只有 light/dark） |
| 184 | 会话 / 项目标签（Tag） |
| 185 | 会话书签（Bookmark）跳转 |
| 186 | 输入框 `/think` 内联指令提示 |
| 187 | 输出 Markdown 表格 / 代码块快速复制 |
| 188 | Jupyter / notebook 类型预览 |
| 189 | 图片生成结果聚合为 gallery |
| 190 | 视频帧提取预览 |
| 191 | 会话摘要导出为 PDF |
| 192 | RAG 搜索历史会话 |
| 193 | 会话防重命名冲突提示 |
| 194 | 主题族（paper / ink）加入跟随系统 |
| 195 | 会话列表中显示首条消息预览 |
| 196 | 权限请求 inline 在 composer 而非 overlay |
| 197 | 支持自定义快捷键复用 |
| 198 | 会话 / 项目导入导出完整版 |
| 199 | 无障碍 keyboard-only 完整流程 |
| 200 | 中文输入法下 Enter 发送行为提示 |

---

## 汇总

| 级别 | 数量 |
|------|------|
| P0 | 4 |
| P1 | 24 |
| P2 | 45 |
| P3 | 27 |
| **合计** | **100** |

## 推进建议

1. **P0**（#101–104）：并发写锁 + RPC 方法白名单最紧急，集中在 Rust `cli_bridge.rs` / `lib.rs`。
2. **P1**：优先 **#105/#107/#108/#109/#110**（长会话卡顿 + `useAppModel` 巨型 hook 拆分），再 **#113/#115/#117**（审阅 / Git 高频痛点）。
3. **P2**：体验类（#129/#137/#138/#140）与工程债（#146/#159/#160）分泳道。
4. **P3**：等有需求再投。

> 说明：本轮多数改进方向（frecency、markdown-cache、mermaid-once、preview-find、session-recap、parallel-subagents、context-panel 等 lib/组件）**已存在但可能未完全接入**——需逐项核对是否在 UI 中真正生效，这本身值得单独一个任务。
