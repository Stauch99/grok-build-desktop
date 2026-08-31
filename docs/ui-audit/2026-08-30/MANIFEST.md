# Grok Build UI 全量截图 — 2026-08-30

Live Tauri 窗口（`Grok Build`，约 2056×1289）。Cua 落盘 PNG 为 1568×983（窗口截图像素，非 2× 原图）。落盘后做了 256 色量化 + PNG 压缩（约 9.2 MB → 2.7 MB）。

侧栏项目文件夹间距已从 16px 收到 **8px**（`.project { margin: 0 0 8px }`）。会话行间距未改。

## 截图

| 文件 | 界面 |
| --- | --- |
| `01-main.png` | 主界面：空新对话、右侧栏关闭、侧栏三区（置顶 / 项目 / 独立对话） |
| `02-thread-dashboard-progress.png` | 有内容的会话 + 右侧栏 Dashboard / 进度 |
| `03-rail-dashboard-files.png` | Dashboard / 文件 |
| `04-rail-dashboard-terminal.png` | Dashboard / 终端 |
| `05-rail-git.png` | Git：分支条、提交、改动列表（文件名 + 路径面包屑 + 访达） |
| `06-rail-preview.png` | 预览空态 |
| `07-rail-explorer.png` | 文件管理：项目目录树 |
| `08-rail-explorer-expanded.png` | 文件管理：展开 `docs` |
| `09-rail-preview-file.png` | 预览打开 `AGENTS.md`（Markdown） |
| `10-sidebar-project-expanded.png` | 侧栏展开 `grok_build_desktop` 会话列表 |
| `11-project-menu.png` | 项目操作菜单 |
| `12-session-menu.png` | 会话操作菜单 |
| `13-account-menu.png` | 侧栏底账户菜单：设置 / 扩展中心 / 快捷键 |
| `14-settings-shortcuts-focus.png` | 设置：从快捷键入口进入（对话页快捷键区） |
| `15-settings-overview.png` | 设置 / 总览 |
| `16-settings-appearance.png` | 设置 / 外观 |
| `17-settings-chat.png` | 设置 / 对话 |
| `18-settings-extensions.png` | 设置 / 扩展中心 |
| `19-settings-usage.png` | 设置 / 用量 |
| `20-settings-about.png` | 设置 / 关于 |
| `21-command-palette.png` | 命令面板 ⌘K |
| `22-overlay-session-dashboard.png` | 覆盖层：会话总览 |
| `23-overlay-imagine.png` | 覆盖层：图片 |
| `24-overlay-agents.png` | 覆盖层：代理 |
| `25-overlay-memory.png` | 覆盖层：记忆 |
| `26-overlay-usage.png` | 覆盖层：用量 |
| `27-overlay-imagine-video.png` | 覆盖层：视频（见下方缺口） |
| `28-hub-skills.png` | 扩展中心 / 技能（含搜索框） |
| `29-hub-mcp.png` | 扩展中心 / MCP |
| `30-hub-plugins.png` | 扩展中心 / 插件 |
| `31-hub-marketplace.png` | 扩展中心 / 市场 |
| `32-hub-hooks.png` | 扩展中心 / Hooks |
| `33-composer-slash.png` | 输入框斜杠命令（`+` / `/`） |
| `34-model-menu.png` | 切换默认模型 |
| `35-effort-menu.png` | 推理力度 |
| `36-mode-menu.png` | 模式：Agent / Plan / 始终批准 |
| `37-workspace-filter.png` | 工作区筛选 |
| `38-sidebar-collapsed.png` | 侧栏折叠 |
| `39-rail-dashboard-restored.png` | 回到 Dashboard |
| `40-rail-closed-thread.png` | 右侧栏关闭后的会话主界面 |
| `41-new-chat.png` | 新对话空状态 |

## 未截到 / 未展开

- **许可确认卡**：当时没有待处理许可，没有弹卡。
- **视频画廊**（`/imagine-video`）：斜杠列表被 skill 占满，未单独筛到该命令；结构与 `23-overlay-imagine.png` 同类。
- **原生系统对话框**（选目录、访达）：未打开，避免抢前台。
- **深色模式**：未切换，以免改用户外观偏好。
- **分屏对话**：未打开。
