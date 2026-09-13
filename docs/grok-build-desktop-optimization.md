# Grok Build Desktop · 优化建议清单

> 版本：0.4.0 review · 日期：2026-08-28
> 视角：产品经理 + 编程工程师
> 覆盖：`App.tsx` / `styles.css` / `lib.rs` / `cli_bridge.rs` / `Composer.tsx` / `settings.tsx` / `ExtensionsHub.tsx` 等核心模块

## 判定标准

| 级别 | 判定 | 含义 |
|------|------|------|
| **P0** | 安全漏洞 / 数据完整性风险 | 发布前必须修，不修有实际损害（读任意文件、写坏配置、越权写盘） |
| **P1** | 核心体验痛点 + 明显性能瓶颈 + 高价值安全面 | 下个版本应做，做完体验质变 |
| **P2** | 有价值但不紧急 | 中期排期，持续迭代 |
| **P3** | 锦上添花 / 可选 | 低成本、低频、证明有需求再投入 |

---

## P0 · 阻断级（安全 + 数据完整性）

| # | 建议 | 为什么是 P0 |
|---|------|-------------|
| 97 | **设置 CSP**：`tauri.conf.json` 中 `"csp": null` 改为具体策略 | 无任何 Content-Security-Policy。WebView 渲染 agent 生成的 HTML 工件，一旦夹带脚本，无 CSP 时可在本地执行 / 冒用 Tauri API。**最紧急。** |
| 96 | **收紧 assetProtocol scope**：`allow: ["$HOME/**", ...]` 收窄到 workspace + 白名单 | 当前协议几乎能读整个用户目录，仅靠几个 deny 兜底。XSS 或恶意 HTML 工件配合 `convertFileSrc` 就能读任意用户文件。 |
| 98 | **加固 `HtmlArtifactPreview`**：确认 html-frame 是否 `sandbox`，是否去除 `allow-same-origin` | agent 输出可含 `<script>`。必须 `sandbox` 且**不** `allow-same-origin`，否则是无 CSP 时的直接 RCE 面。 |
| 66 | **修 `write_allowed_text` 的 TOCTOU** | 先 `canonicalize` 再 `std::fs::write`，中间可被 symlink 替换，先有写权限者可逃逸到任意路径。改 `O_NOFOLLOW` + open fd 后写入。 |
| 89 | **`config.toml` 并发写保护** | `write_config_text` 与 `patch_cli_settings` 可能同时写同一文件，读-改-写丢字段，导致配置损坏。加写锁或 CAS。 |

---

## P1 · 高优先（核心体验 + 性能瓶颈 + 高价值安全面）

### 工程结构（大债，也直接导致卡顿）

| # | 建议 | 理由 |
|---|------|------|
| 61 | **拆分 `App.tsx`**（3215 行）→ 抽 `useAcpSession` / `useGitWatcher` / `usePermissionQueue` / `useCommandPalette` | 会话路由、RPC、权限逻辑堆在一个组件，改一处易炸另一处；是 P2 边界里"routing 留在 App.tsx"的长期维护来源。 |
| 62 | **`styles.css`（4182 行）按 feature 拆分**：tokens / sidebar / thread / composer / settings / review | 全局单文件超出编码规范（<800 行/文件） |
| 63 | **`Composer.tsx`（921 行）抽子组件**：ComposerChips / MentionMenu / SlashMenu / QueueStrip | 超 800 行边界 |
| 64 | **`unknown` 类型改 ACP 事件 discriminated union** | `read_session_updates` 返回 `unknown[]`，全链靠 `asRecord`。避免 `any` 渗透与运行时错。 |

### 性能（长会话卡顿主因）

| # | 建议 | 理由 |
|---|------|------|
| 42 | **启动速度** | `start_agent` 阻塞在 grok `initialize`，冷启动到可交互慢。后台预热 + 前端先渲染 UI 再连接。 |
| 43 | **长会话内存** | `hydrateFromUpdates` 一次读全 `updates.jsonl`，数千条消息卡住布局。增量加载 + 虚拟列表（`react-window`）。 |
| 44 | **滚动性能** | 长列表每次全量 `groupWorkRuns` + 每条消息独立 Markdown render。`ChatRow` / `Markdown` 加 `React.memo`。 |
| 45 | **`workspaceMtime` 轮询改文件系统事件** | 每 4 秒全量扫目录 mtime，大仓库开销大且延迟高。改 fsevents / watched directory。 |
| 50 | **补 memoization 分层** | `sidebarSections` / `paletteItems` 已 memo，但消息级组件没 memo，长列表是重渲染大头。 |
| 49 | **渲染高开销组件拆分** | 同 #61/#62/#63 债，复合问题——长会话卡顿主因。 |
| 76 | **Mermaid 按需加载** | 完整 mermaid 很重且每 md 块都跑。`React.lazy` + `dynamic import` + 结果缓存。 |
| 77 | **Markdown 渲染缓存** | 流式消息每 chunk 重新 parse。最终消息 memoize，流式中只渲染未完成的单份。 |

### 产品核心体验

| # | 建议 | 理由 |
|---|------|------|
| 12 | **预览源码语法高亮** | 当前 `<pre>` 纯文本。至少 TS/TSX/Py/Rust/JSON/MD 轻量高亮。 |
| 19 | **多标签预览** | 一次只能预览一个文件，切换文件丢上下文。多标签（tab）预览。 |
| 20 | **文件树层级展开** | `@` 引用和文件预览需看到目录结构，当前平铺列表大项目无法定位。 |
| 24 | **Git 一键 commit** | 能看 diff、能开 log，却没有"暂存+提交"。README 说不做完整 Git 客户端，但 commit 是 coding-agent 高频动作。 |
| 1 | **会话自动摘要** | >10 轮长会话顶部生成可折叠"对话回顾"。当前只有标题无正文摘要。 |
| 81 | **标题覆盖持久化** | `setTitleOverride` 只存本地 state（`webui.json`），改的标题关 app 重开可能丢失。 |
| 21 | **Rewind 加二次确认输入** | 危险操作（还原文件）目前只有预览框，无"输入 rewind 确认"，防误触。 |

### 安全面（高价值）

| # | 建议 | 理由 |
|---|------|------|
| 99 | **修 `open_review_path` symlink TOCTOU** | canonicalize 后仍可被替换为 symlink 逃逸。用 `O_NOFOLLOW` / `lstat`。 |
| 80 | **`open_path` 参数注入** | macOS 有 `--` 分隔，Linux/Windows 无。`target` 含特殊参数可能注入。统一安全调用。 |
| 100 | **`run_grok*` 参数白名单加固** | `grok_args_allowed` 只挡头命令，`--` 开头的参数可透传。禁非法 `--` 参数，路径型参数做 `Path` 校验。 |

### 国际化 / 可达性

| # | 建议 | 理由 |
|---|------|------|
| 55 | **补齐 i18n** | `i18n.ts` 只有 ~45 个 key，UI 文案大量硬编码中文。英文 locale 实际 95% 界面仍中文。要么补全，要么标注 en 为实验性。 |
| 93 | **顶层 ErrorBoundary** | 任一组件抛错即白屏。加错误边界 + 友好错误页。 |
| 68 | **`read_session_updates` 增量加载** | 每次切会话读全文件并解析全部行。按 chunk/行缓存，只解析新增部分。 |

---

## P2 · 中优先（有价值，中期迭代）

### 会话管理

| # | 建议 |
|---|------|
| 2 | 会话重命名入口太深，建议行内双击标题直接改名 |
| 3 | 会话批量操作（删除 / 已读 / 归档，Shift/Cmd 多选） |
| 6 | 长会话大纲 / 导航地图（当前 tick 标记信息太薄） |
| 7 | 会话导出为 MD/JSON 文件并支持导入恢复（当前只复制剪贴板） |
| 10 | 无会话 compose 框草稿持久化（重开 app 丢失） |
| 11 | 审阅栏标签按会话记忆上次打开的 tab |

### 预览面板

| # | 建议 |
|---|------|
| 13 | 预览源码加行号 |
| 14 | 预览面板 Ctrl+F 查找 / 高亮 / 跳转 |
| 15 | 图片预览缩放 / 平移（agent 产出图片多，固定大小不可用） |
| 17 | 预览编辑保存加成功 / 失败反馈 |
| 18 | 预览编辑保存后自动触发 Git 刷新 |
| 22 | Rewind 对二进制 / 超 2MB 文件给出"将跳过"说明 |

### Git

| # | 建议 |
|---|------|
| 23 | 切换分支后检测会话 / 分支关系并提示 |
| 25 | 预览面板 Git blame / 行级历史 |
| 27 | 未跟踪文件支持点击查看内容（目前只显示行数） |
| 28 | worktree 合并 / 删除后自动清理无效项目路径 |

### 命令 / 输入

| # | 建议 |
|---|------|
| 30 | `@` 引用可选"附带文件内容" |
| 31 | 命令面板按最近使用 + frecency 排序 |
| 32 | 命令面板箭头键导航 + 回车执行的可达性确认 |

### 权限

| # | 建议 |
|---|------|
| 38 | 权限卡"此会话内记住"选项（高频工具少打扰） |
| 39 | 权限 90s 超时默认拒绝太激进，加"允许当前调用"选项或超时提醒 |
| 41 | 信任目录加二次确认（尤其危险目录） |

### 性能

| # | 建议 |
|---|------|
| 46 | `listMemoryChanges` 轮询改文件系统事件 |
| 47 | `_x.ai/billing` 轮询拉长间隔，可只在该有 activity 时查 |
| 71 | `list_sessions` / `list_project_roots` 加缓存，避免每次全量 walkdir |
| 74 | `save_webui_state` 写前比较 + 节流，避免高频写全量 |
| 75 | 启动时非关键预加载（usage / managed / agents）降级为延迟加载 |
| 88 | 检查所有 `setInterval` / `setTimeout` 的 cleanup |
| 95 | `useReviewController` 切换到会话时加 abort + memo 化 |

### 用量 / 数据

| # | 建议 |
|---|------|
| 51 | 用量统计加时间序列图（轻量毫线图，不引大库） |
| 52 | 成本按模型分摊（当前 `costTicks` 是全局） |

### 可达性 / 国际化

| # | 建议 |
|---|------|
| 56 | 消息流加 `aria-live` 播报（流式输出对 screen reader 不可达） |
| 57 | 颜色对比度达 AA 检查（尤其浅色 usage-chip） |
| 58 | CommandPalette / 菜单 / 预览的 focus trap 与焦点归还 |
| 60 | 会话列表 Tab 遍历顺序 + aria 分组 audit |

### 工程质量

| # | 建议 |
|---|------|
| 65 | `window.confirm` 统一换自定义 Modal（主题一致 + 不阻塞主线程） |
| 72 | app 退出统一清理 grok 子进程 |
| 73 | 完善 `.gitignore`（`tsconfig.tsbuildinfo`、`dist`、打包产物） |
| 79 | `open_in_terminal` 跨平台（当前仅 macOS Terminal.app） |
| 82 | `write_config_text` 2MB 上限收紧到 ~512KB |
| 83 | `patch_cli_settings` 字段白名单校验（防注入任意表） |
| 84 | 补充单测（`applyChatUpdate` 流式合并、usage 更新、上限常量） |
| 85 | 附件路径后端校验（存在性 + 大小 + 允许范围） |
| 90 | 文件读写操作加审计日志（便于排查 + 满足安全 audit） |
| 91 | 会话标题为空时显示首条消息片段，而非"未命名会话" |
| 92 | badge 只计"需要你"，完成态另做图标提示点 |
| 94 | 连接状态切换（发送中 / 未连接）加 smooth 过渡 |

---

## P3 · 低优先（可选 / 有需求再做）

| # | 建议 |
|---|------|
| 4 | 会话对比（同项目两会话 diff） |
| 5 | 会话 Pin 到底部（不只置顶） |
| 8 | 跨项目聚合的全局仪表盘 |
| 9 | 会话模板（复审 / 调查 / 反射预填） |
| 16 | 视频自定义播放器 / 倍速 |
| 26 | Git 冲突解决视图 |
| 29 | 改动导出为 `.patch` |
| 33 | 斜杠命令历史排序 |
| 34 | 粘贴为纯文本（Cmd+Shift+V） |
| 35 | 输入框 Markdown 快捷栏 |
| 36 | 拖拽文件到侧栏某会话 |
| 37 | 附件超限的"改为引用路径"降级 |
| 40 | YOLO 模式会话级显式提示 |
| 48 | 全局键盘监听乐观短路 |
| 53 | 用量"今日"快捷视图 |
| 54 | 自动压缩前后 token 差说明 |
| 59 | 中西文混排字体栈优化 |
| 67 | `read_text_file` 二进制检测用 metadata 预判 |
| 69 | `search_session_text` 先 title 全命中再读 body |
| 70 | `list_imagine_artifacts` 缓存，mtime 变化才重扫 |
| 78 | 通知权限启动时 prefetch |
| 86 | `run_grok_stream` 长行分块而非按行语义 |
| 87 | React strict mode 下 `ensureAgent` 双执行验证 |

---

## 汇总

| 级别 | 数量 |
|------|------|
| P0 | 5 |
| P1 | 22 |
| P2 | 50 |
| P3 | 23 |
| **合计** | **100** |

## 推进建议

1. **先做 P0（5 条）**：全为安全 / 数据完整性，改动集中在 Rust + `tauri.conf.json`，边界清晰。
2. **P0 后立刻做 P1 前几条**：#61（拆分）、#42/#43/#44（性能三连）、#99/#100（安全面）——直接决定"长会话用起来卡不卡"与"安全面是否收住"。
3. **P2 分两泳道并行**：体验类（#2/#6/#11/#13）与工程债类（#62/#63/#64/#65）。
4. **P3 按需**：等用户明确要求再投入，多数是锦上添花。
