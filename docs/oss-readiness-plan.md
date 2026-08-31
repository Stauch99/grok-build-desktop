# 开源就绪度计划

> 基线：`feat/multi-agent-workbench` @ `dafd36d`（2026-08-31），版本 0.4.0  
> 仓库：https://github.com/Stauch99/grok-build-desktop（public）  
> 范围：**外部开发者能否安装、理解、合法贡献**。构建健康与性能见 `audit-stability-ux.md`、`grok-build-desktop-optimization*.md`，本文不重复。

## 怎么用这份文档

- **Done** 不要重做。缺口写在「剩余动作」，每条仍独立可交付。
- 完成任一剩余任务后跑：`npm test && npm run typecheck && npm run build`。动到 `src-tauri/` 再加 `cargo test --manifest-path src-tauri/Cargo.toml && cargo clippy --all-targets`。
- 不要为了让测试通过而改断言，除非该任务明确要求替换测试实现。
- 开工前若实测与「已验证」表不符，先更新表再动手。

## 已验证（不要重复劳动）

| 项 | 结果 |
|---|---|
| 仓库可见性 | public |
| `LICENSE` | MIT |
| `npm test` / `typecheck` / `build` | 基线 `4e3ca46` 时 161 files / 1282 tests 全绿；`tsc` 与 `npm run build` 通过。再动手前重跑一次记下新数字。 |
| 治理文件 | 有 `CONTRIBUTING.md`、`SECURITY.md`、`docs/HANDOFF.md`、issue/PR 模板、`CODEOWNERS` |
| 自动化 | `ci.yml`（Node 22：`typecheck` + `test`）、`triage.yml`、`stale.yml` |
| README | 英文主文 + 中文摘要；边界与非官方声明仍在 |
| `.gitignore` | 已忽略 `.tmp-acp-probe/`、`.tmp-ui-check/` |
| i18n / CSP / Mermaid 懒加载 / `react-window` | 与上一版计划相同，未回退 |

差距现在集中在四块：**包元数据仍叫 WebUI、CI 过浅、没有组件/e2e 测试、上帝模块**。

## 记分板

| ID | 主题 | 状态 | 下一刀 |
|---|---|---|---|
| T1 | LICENSE | **Done** | 只补 `package.json` / `Cargo.toml` 的 `license` 字段（并入 T3） |
| T2 | CI | **Partial** | 补 `build`、Rust 门禁、诚实的跨平台矩阵 |
| T3 | 治理与命名 | **Partial** | CHANGELOG、CoC、license 字段、去掉 WebUI 包名、bug 模板补 CLI |
| T4 | Lint / format | Open | ESLint + Prettier + clippy `-D warnings` |
| T5 | 组件与 e2e | Open | jsdom + Testing Library；Playwright 三条主路径 |
| T6 | 拆上帝模块 | Open | **硬依赖 T5** |
| T7 | a11y | Open | reduced-motion 全局化；axe 挂在 T5 的 Playwright 上 |
| T8 | 体积 | Open | 可并行；Mermaid 已懒加载，勿当 P0 |
| T9 | 对外文档 | **Partial** | README/HANDOFF 已有；清内部计划与 99 张 PNG |

优先级：P0 阻断「作为开源项目存在」；P1 阻断贡献或掩盖回归；P2 触达与长期维护。

---

## P0 · 还没做完的开源门槛

### T2 · 把 CI 做成可信门禁

**已有**：`.github/workflows/ci.yml` 只跑 `npm ci` → `typecheck` → `test`。没有 `npm run build`，没有 Rust，没有打包矩阵。

**仍缺**：

1. 前端 job 追加 `npm run build`（现在本地绿、CI 不锁产物）。
2. Rust job：`cargo test` → `cargo clippy --all-targets`。**先不要** `-- -D warnings`：clippy 仍有约 9 条 warning，必须先做 T4，否则一开即红。
3. 新建 `build.yml`，矩阵 `macos-latest` / `windows-latest` / `ubuntu-latest` 跑 `npm run tauri build`。Linux 需 `libwebkit2gtk-4.1-dev`、`libappindicator3-dev`、`librsvg2-dev`、`patchelf`。缓存 `~/.cargo`、`src-tauri/target`、npm。
4. `tauri.conf.json` 的 `bundle.targets` 含 dmg/app/nsis/msi/deb/appimage，README 写明只在 macOS 13+ 验证过，且「在终端打开」只调 Terminal.app。矩阵**允许失败**——失败记 issue，然后二选一：修，或收窄 `bundle.targets` 并改 README。禁止为了变绿而删矩阵、不改文档。

**验收**：PR 上 frontend（含 build）绿；Rust job 在 T4 之后绿；跨平台矩阵的真实状态有 issue 或已与 `bundle.targets`/README 对齐。

---

### T3 · 元数据、变更记录、模板缺口

**已有**：MIT、CONTRIBUTING、SECURITY（GitHub Advisory）、HANDOFF、bug/feature 表单、PR 模板、triage 标签。

**仍缺**：

| 缺口 | 为什么还算 P0 |
|---|---|
| `package.json` / `Cargo.toml` 无 `license` | LICENSE 文件在，包管理器与 crates 元数据仍像「未授权」 |
| `"name": "grok-build-webui"`，Cargo description 仍是 WebUI | README 明确不是浏览器 WebUI；外部检索会被误导 |
| 无 `repository` / `description` | npm 元数据无法指回 GitHub |
| 无 `CHANGELOG.md` | README 写明无应用内更新——changelog 是用户知悉变更的通道 |
| 无 `CODE_OF_CONDUCT.md` | CONTRIBUTING 只有一段话；对外仓库缺独立 CoC |
| bug 模板无 CLI 版本、无 doctor | 多 CLI 仓库没有这两项，issue 无法分诊 |
| SECURITY 无响应时限 | 「会修」不是 SLA |

**动作**：

1. `package.json`：`"license": "MIT"`，`"repository"` 指向本仓，`"description"` 用 README 第一句，**不要**改成可在浏览器部署的暗示。
2. `Cargo.toml`：`license = "MIT"`，description 去掉 WebUI。包名 `grok-build-webui` → `grok-build-desktop` 会碰到 `[lib] name = "grok_build_webui_lib"` 与所有引用——**单独 PR**，必须 `cargo test` + 一次 `tauri build`。做不到就先改 description / license，包名留 issue。
3. `CHANGELOG.md`：Keep a Changelog，至少回填 `0.4.0`（多 agent 工作台、开源包装）。
4. 增加 Contributor Covenant 的 `CODE_OF_CONDUCT.md`，CONTRIBUTING 链过去。
5. bug 模板加：CLI 版本、是否跑过 Settings → doctor、重现时的 `agentId`。
6. SECURITY 写明：收到 advisory 后 **3 个工作日**内确认，修复时间按严重度另议。

**验收**：`grep -n license package.json src-tauri/Cargo.toml` 均为 MIT；CHANGELOG 存在；bug 表单能填 CLI/doctor；不把 `webui` 当产品名对外使用（crate 改名可另 PR）。

---

## P1 · 贡献质量与回归

### T4 · Linter 与 formatter

**问题**：无 ESLint、Prettier、stylelint、`.editorconfig`、`cargo fmt` 门禁。

**动作**：

1. ESLint 9 flat + `typescript-eslint` + `eslint-plugin-react-hooks`。`react-hooks/exhaustive-deps` 对 `useAppModel.ts`（约 43 个 `useEffect`）先 **warn**。升 error 是 T6 的事。
2. Prettier + `.editorconfig`。全量格式化必须单独 commit，禁止和逻辑改动混在一起。
3. `cargo clippy --fix` 清掉可自动修的 warning，剩的手改；然后 CI 才开 `-D warnings`。`cargo fmt --check` 同理单独 commit。
4. `package.json` 增加 `lint`、`format:check`，接到 T2。

**验收**：`npm run lint` 无 error；`cargo clippy --all-targets -- -D warnings` 与 `cargo fmt --check` 通过。

---

### T5 · 组件测试与 e2e（本计划最重要的技术债）

**问题**：测试几乎全是纯逻辑。`vite.config.ts` 为 `environment: "node"`、`include: ["src/**/*.test.ts"]`。没有 `.test.tsx`，没有 jsdom / Testing Library / Playwright。`PermissionCard.test.ts` 用 `renderToStaticMarkup`，测不到焦点和键盘。`src/lib/css-review.test.ts` 只断言样式表里有某段注释和选择器字面量——改注释会假红，改实现会假绿。同类嫌疑：`menu-select-css.test.ts`、`ui-chrome.test.ts`、`sidebar-collapse.test.ts`、`todo-wrap.test.ts`。

**动作**：

1. 加 `jsdom` + `@testing-library/react` + `@testing-library/user-event`。双环境：现有 `.test.ts` 留在 node（**不允许这批测试变红**），`.test.tsx` 走 jsdom（`environmentMatchGlobs` 或 vitest projects）。
2. 按风险写组件测试：`Composer.tsx`（发送 / IME Enter / `@` / 斜杠）、`PermissionCard.tsx`（键盘与超时，替换 static markup）、`CommandPalette.tsx`（打开 / 方向键 / Esc）、`Thread.tsx` 虚拟化滚动、`trap-focus.ts` 的真实 Tab 循环。
3. Playwright 三条：**发消息并看到流式回复**、**批准一次权限**、**开并列双窗格**。没有本机 CLI 的 CI 要用 fixture / stub ACP，不要假装连了真模型。
4. 渲染断言稳定后，**删掉或改写** CSS 正则测试，不要两套并存。
5. 接到 T2。

**验收**：存在 `.test.tsx` 且 jsdom 绿；原 node 测试仍全绿；三条 e2e 在 CI 有定义（真跑或明确 skip + issue）；焦点不再只靠 CSS 字符串守护。

---

### T6 · 拆上帝模块

**硬依赖 T5。** 没有渲染测试就拆 `useAppModel.ts` 或 `styles.css`，等于无保护地改 effect 时序和视觉。

| 文件 | 行数（`dafd36d`） | 拆法 |
|---|---|---|
| `src-tauri/src/lib.rs` | 3296 | command 按域搬到 `commands/{session,git,config,…}.rs`，`lib.rs` 只注册 |
| `src/styles.css` | 3188 | 继续拆进 `styles/`，`tokens.css` 仍是唯一 token 源；**T5 之后** |
| `src/hooks/useAppModel.ts` | 2345 | 59 state / 43 effect；按域 `useSessionModel` / `usePaneModel` / `useSettingsModel` / `usePermissionModel`，一次 PR 一个域 |
| `src-tauri/src/cli_bridge.rs` | 2140 | 与 `lib.rs` 同样机械拆分 |

先 Rust（纯移动、低风险），再 CSS，最后 `useAppModel`。每次全量 `npm test`，桌面改动再 `tauri dev` 冒烟。

**验收**：无业务源文件 > 800 行（测试与生成物除外）；拆分后行为不变。

---

## P2 · 触达与维护

### T7 · 无障碍

- 约 26 条 `transition`/`animation`，全仓几乎没有 `prefers-reduced-motion`。先看 `src/lib/motion.ts` 是否已承担 JS 侧，CSS 在 `tokens.css` 加全局 `@media (prefers-reduced-motion: reduce)`。
- 审计 rail / Explorer / Git / Miller picker 的键盘与 roving tabindex。
- T5 的 Playwright 挂 `@axe-core/playwright`，主界面 / 设置 / 扩展中心无 serious/critical。
- 深浅主题对比度。

**验收**：reduced-motion 全局生效；主流程可纯键盘走完；axe 门槛在 CI。

### T8 · 体积

主 chunk 曾测到 gzip ~213KB（Vite 对 >500KB 未压缩 chunk 报警）。Mermaid **已经懒加载**，大图类型与 katex 不进首屏。可做：少注册不用的 Mermaid 图种、确认是否需要 katex、`manualChunks`、CI 体积门禁。不要当成开源阻断项。

### T9 · 文档与仓库卫生

**已有**：英文 README（保留产品边界）、`docs/HANDOFF.md`（架构、加 agent 清单、状态归属）。

**仍缺**：

1. 内部 `docs/superpowers/plans/` 与 `docs/ui-audit/**/*.png`（约 99 张图，撑大 git）对外部读者无用。移到 wiki / Release 附件，或在 README 标明「维护者档案、非产品文档」。
2. `docs/` 分使用者 / 开发者两层索引，避免 30+ 计划文件平铺。
3. 包名 WebUI 残留与 T3 一起清。不要再写第二份「如何加 CLI」——补 HANDOFF 缺口即可。

**验收**：新人能从 README → HANDOFF 上路，而不必读 superpowers 计划；git 里不再把审计 PNG 当默认必拉内容（或有明确归档说明）。

---

## 顺序

```
T3 元数据 / CHANGELOG ──── 立刻，不依赖 CI
T4 lint ──► T2 补齐 CI ─── clippy -D warnings 必须在 T4 之后
T5 测试 ──► T6 拆模块 ─── 无 T5 不准拆 useAppModel / styles.css
         └► T7 a11y ──── axe 挂在 Playwright 上
T8 体积 ──────────────── 随时
T9 卫生 ──────────────── 可与 T3 并行；架构图已在 HANDOFF，不必重写
```

**硬约束**：T6 依赖 T5；T2 的 clippy 门禁依赖 T4；不要重做 LICENSE、不要再写一套英文营销 README。

## 全局验收

```bash
npm test && npm run typecheck && npm run build
```

Rust：

```bash
cargo test --manifest-path src-tauri/Cargo.toml
cargo clippy --manifest-path src-tauri/Cargo.toml --all-targets
```

不得回退：前端测试全绿、`typecheck` exit 0、`npm run build` 通过。Rust 测试数量以动手当天 `rg -c '#\[test\]' src-tauri` 为准，只增不减。
