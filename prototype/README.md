# Grok Build 交互原型

高保真 HTML 原型，覆盖设计稿 PR 1 + PR 2 的界面和交互。数据是模拟的，不连 `grok agent`。

打开：

```bash
# 仓库根目录
python3 -m http.server 4173 --directory prototype
# 浏览器访问 http://127.0.0.1:4173/
```

或直接打开 `prototype/index.html`（模块脚本在 file:// 下部分浏览器可用）。

## 要对齐的交互

- 对话列 `min(100%, --thread)`，助手撑满，用户气泡 `min(36rem, 100%)`
- 窗口小于 1100：右栏变浮层，默认收起；侧栏仍可点
- 左下角太阳 / 月亮切主题（不是设置齿轮）
- 标题点击即改；下拉：新建、删除、访达、复制、恢复自动标题
- 搜索过滤项目名和会话显示名
- 进度：无任务才显示三对勾；有任务只显示待办
- 工作目录：文件夹 / 文件 / 本轮文件
- 上下文无连接器、无模式分段；Agent / Plan / 始终批准是输入栏芯片，贴在模型左侧
- 模型下拉改默认，不改当前会话标签
- 左下角太阳切主题，旁边齿轮打开设置弹窗；左侧没有「会话 / 设置」切换

本地存储键：`grok-build-proto-webui`（模拟 `~/.grok/webui.json`）。

## 复用到正式 UI

| 原型 | 正式文件 |
| --- | --- |
| `styles.css` 类名与 token | 覆盖 `src/styles.css` |
| `lib.js` 纯函数 | `src/lib/projects.ts` / `commands.ts` / `rail.ts` |
| `index.html` 结构 | `src/App.tsx` / `SessionMenu.tsx` / `Settings.tsx` |
| `app.js` 里 `data-act` 行为 | 对应 React 事件，把 toast「原型：将打开」换成 `openPath` / ACP |
