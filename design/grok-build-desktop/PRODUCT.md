# Grok Build Desktop · Product Contract

## Identity

**Grok Build Desktop — 本地 coding-agent 工作台。** 原生桌面工作区与控制中心，连接 Grok ACP/CLI；Grok CLI 拥有 agent runtime，桌面端负责组织、监督与审阅。

## Capability classes

### Core

- 项目与会话组织：新建、恢复、分叉、置顶、归档、独立对话
- 运行监督：流式进度、计划、排队/改向、状态、通知
- 许可与模式：逐项许可、Agent / Plan / 始终批准、模型选择
- 统一审阅栏：进度、文件、改动、上下文、工具详情与文件预览；Git 状态/历史在改动标签内

### Supporting

- 轻量文件预览/编辑、Markdown/HTML 沙盒预览、`@` 文件引用
- 命令面板与桌面本地斜杠动作
- 隔离 worktree 会话
- 图片、视频、代理、记忆、用量、审阅入口
- 文件 rewind：只覆盖会话事件中有已知 diff 的文件；不是工作区快照或完整回滚

### Administration

- 扩展中心：技能、MCP、插件、市场、Hooks
- CLI/登录/agent 健康、`config.toml` 与 managed config
- 外观、密度、快捷键、托盘和会话偏好
- 更新由外部发布渠道分发并手动安装；无应用内 updater

### Experimental / CLI-only

- CLI runtime 动态提供的命令可在会话中出现并转发
- `/bridge`、`/loop`、`/goal`、`/workflows` 不属于默认静态桌面命令；没有连贯桌面流程时不主动展示
- 未接入主导航或不可达的组件视为 hidden/residue，保留到 P1 进行可达性证明和清理，不在 P0 广泛删除

## Canonical terms

- 扩展中心
- 会话总览
- 图片
- 视频
- 代理
- 记忆
- 用量
- 审阅

后端/API/协议标识保持稳定；规范词仅约束用户可见文案。

## Non-goals

- 完整 IDE、语言工作台或调试器
- 浏览器可部署 WebUI
- 浏览器模式或远程控制模式（本版本）
- 重写 Grok agent runtime、模型或工具执行层
- 完整 Git 客户端
- 完整工作区快照、任意文件回滚或灾难恢复
- 完整 IDE 式多列常驻布局。右侧审阅栏由用户显隐，打开后先显示改动 / 文件 / 预览 / 终端入口，不是编辑器+浏览器+PTY。

## P1 information architecture (current)

- 左侧会话列表默认按项目分组；用户可改为按更新时间或状态，并可配置排序、置顶（会话与项目）、显示 token / 状态 / worktree。
- 侧栏顶部只有新对话和搜索（搜索打开命令面板）。设置、扩展中心、快捷键在账号菜单。
- 主会话右侧仍是唯一审阅栏，可关闭。打开且无对话跳转时显示四宫格入口；进度 / 上下文 / 详情仍由对话内动作打开。
- 分屏模式保持会话优先，审阅栏关闭且不可用；不会改变 ACP/session 运行语义。
- 设置中的「扩展」是通往扩展中心的单一入口，不维护第二套 MCP 开关。


## P2 boundary (deferred)

- Session transport, ACP process lifecycle, and cross-pane request routing remain in `App.tsx` for P2. Extracting them requires a dedicated routing migration because changing ownership can alter which live session receives events, cancellation, or permission responses.
- File writes still check-then-write by pathname. Closing remaining TOCTOU races needs descriptor-relative `openat`/`O_NOFOLLOW` work, not another caller-root check.
- 「在终端打开」is macOS Terminal.app only this release. File open already uses the platform opener (`open --`, `xdg-open`, `explorer`).
