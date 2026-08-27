# Grok Build Desktop

**Grok Build Desktop — 本地 coding-agent 工作台**

面向 Grok ACP/CLI 的原生桌面工作区与控制中心。它帮助你组织项目和会话、监督运行与许可、审阅文件和改动；Grok CLI 负责 agent runtime、模型调用与工具执行，桌面端不重写 agent。

```
React 界面  --Tauri/ACP-->  grok agent stdio
```

## 产品边界

- 桌面端提供轻量文件预览/编辑与 Git 审阅，不是完整 IDE；复杂编辑、调试和版本控制仍交给专用工具。
- 前端使用 Web 技术实现，但随 Tauri 作为原生桌面应用运行，不是可在浏览器部署的 WebUI。
- 本版本不支持浏览器模式或远程模式。
- 「回到这里」只还原会话中有已知 diff 记录的文件改动，不是完整工作区回滚；未记录或无法识别的改动不会被还原。

## 需要

- macOS 13+ 为当前开发与验证环境；打包配置包含 Windows 与 Linux
- 文件打开使用系统启动器：macOS `open --`、Linux `xdg-open`、Windows `explorer`
- 「在终端打开」本版本仅调用 macOS Terminal.app；其他平台会失败
- 已安装并登录的 Grok Build CLI（`~/.grok/bin/grok`）
- Node 22+、Rust（开发和打包时）

## 开发

```bash
npm install
npm test
npm run tauri dev
```

仅构建前端：

```bash
npm run build
```

## 打包

```bash
npm run tauri build
```

macOS 产物位于 `src-tauri/target/release/bundle/macos/Grok Build.app` 和 `dmg/`；其他平台产物由 Tauri 对应 bundle target 生成。

## 能力

### Core workflow

- 工作区列表可分组/筛选/置顶项目
- 账号菜单进入设置与扩展
- 审阅栏四宫格入口（终端为系统终端 + 本会话 bash 工具）
- 项目目录与会话列表（读取 `~/.grok/sessions`），支持父子树、置顶、归档
- 不绑定目录的「独立对话」收件箱，可移入项目
- 新建/恢复会话、并列双窗格，流式文本、思考与计划
- 运行状态、排队/改向、卡死提示、完成/许可系统通知
- 许可请求与 Agent / Plan / 始终批准模式，模型和许可设置写回 `config.toml`
- 工具调用按终端、读取、编辑、搜索、写入分类展示

### Coding support

- `@` 引用工作区文件、斜杠命令与 ⌘K 命令面板
- 轻量文件预览/编辑；Markdown 渲染（含 Mermaid）、源码、复制和系统打开
- 行级 diff：行号、增删标记、未改动段折叠和大改动截断说明
- Git 状态、分支领先/落后、改动统计、Git 历史与隔离 worktree 会话
- 「本次改动」展示相对 HEAD 的文件和增删行数
- 「回到这里」仅处理会话内已知 diff-backed 文件变化，并在执行前预览；不是完整工作区回滚

### Administration

- 扩展中心管理技能、MCP、插件、市场和 Hooks
- 会话总览、图片、视频、代理、记忆、用量与审阅相关入口
- 主题、密度、对话行为、快捷键、托盘和 CLI 健康信息
- 当前版本不提供应用内更新；新版本通过外部发布渠道获取并手动安装

## 说明

这是社区桌面客户端，不是 xAI 官方应用。
