# Frost 主题 + 全局动效升级 实现计划

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 将 beautifului.dev 的设计语言移植为第四主题族 frost（颜色层 + 结构层），并全局升级动效（shimmer、流式光标、滑动悬停等），另新建 Selection Actions 划词工具条组件。

**Architecture:** 三层分离——① `tokens.css` 新增 `:root[data-theme-family="frost"]` light/dark 令牌块；② 新文件 `frost.css` 承载全部以 frost 作用域限定的结构性覆盖；③ 动效写入各组件现有 CSS，只消费 token，四主题通用。切换链路复用现有机制（Settings → persist → `useAppModelEffects.ts:152` 写 `document.documentElement.dataset.themeFamily`）。

**Tech Stack:** React 19 + TypeScript + Vite + Tauri；纯手写 CSS（无 Tailwind、无新依赖）；vitest（含本项目特有的 CSS 源码断言测试模式，见 `src/lib/css-review.test.ts`）；Playwright E2E。

**Spec:** `docs/superpowers/specs/2026-09-07-frost-theme-beautifului-port-design.md`

## Global Constraints

- **不新增任何 npm 依赖**（spec §7.2）
- **frost.css 每条规则必须以 `:root[data-theme-family="frost"]` 开头**，零泄漏（spec §4）
- **动效只用 compositor 友好属性**：`transform` / `opacity`（展开类允许 `grid-template-rows` 技法）；一律走 `var(--dur*)` / `var(--ease*)` 令牌（spec §5）
- **reduced-motion**：全局降级开关已存在于 `src/styles.css:290`（`animation-duration: 0.001ms !important`）；**状态性动效**（运行中进度）需像 `.spinner` 一样加入豁免，装饰性动效（shimmer、入场）不豁免
- **不复制 beautifului.dev 站点任何 JS/CSS 产物**；令牌值使用 spec §3 已提取/推导的数值（spec §11）
- 测试命令：单测 `npx vitest run <file>`，全量 `npm test`，类型 `npm run typecheck`
- 提交信息格式：`<type>: <description>`（type ∈ feat/fix/refactor/docs/test/chore/perf/ci），**无 attribution footer**
- 所有新 CSS 动画的 `@keyframes` 命名用小写连字符：`skeleton-shimmer`、`caret-blink`、`spine-enter`、`chip-in`、`run-progress`、`sel-in`

---

### Task 1: frost 令牌颜色层（tokens.css）+ 对比度测试

**Files:**
- Modify: `src/styles/tokens.css`（文件末尾、`:root[data-density="compact"]` 块之前插入）
- Test: `src/lib/frost-contrast.test.ts`（新建）

**Interfaces:**
- Consumes: 无（首任务）
- Produces: CSS 变量 `--bg/--bg-side/--bg-card/--bg-alt/--bg-input/--bg-hover/--bg-active/--line/--line-strong/--text/--muted/--faint/--accent/--accent-deep/--cta/--cta-text/--ok/--warn/--danger/--shadow/--shadow-l/--radius*` 在 `data-theme-family="frost"` 下的值。后续所有任务只消费这些 token 名，不引用具体色值。

- [ ] **Step 1: 写失败的对比度测试**

新建 `src/lib/frost-contrast.test.ts`。该测试解析 tokens.css 的 frost 块，把 oklch 转 sRGB，断言 WCAG AA 对比度（数值已预先验证全部通过，见 spec §10 风险表）：

```ts
import { describe, expect, it } from "vitest";
import { cssFile } from "./css-source";

function oklchToSrgb(L: number, C: number, H: number): [number, number, number] {
  const h = (H * Math.PI) / 180;
  const a = C * Math.cos(h);
  const b = C * Math.sin(h);
  const l_ = L + 0.3963377774 * a + 0.2158037573 * b;
  const m_ = L - 0.1055613458 * a - 0.0638541728 * b;
  const s_ = L - 0.0894841775 * a - 1.291485548 * b;
  const l = l_ ** 3, m = m_ ** 3, s = s_ ** 3;
  const r = 4.0767416621 * l - 3.3077115913 * m + 0.2309699292 * s;
  const g = -1.2684380046 * l + 2.6097574011 * m - 0.3413193965 * s;
  const bb = -0.0041960863 * l - 0.7034186147 * m + 1.707614701 * s;
  const f = (x: number) => {
    x = x <= 0.0031308 ? 12.92 * x : 1.055 * Math.pow(Math.max(x, 0), 1 / 2.4) - 0.055;
    return Math.min(1, Math.max(0, x));
  };
  return [f(r), f(g), f(bb)];
}

function luminance([r, g, b]: [number, number, number]): number {
  const c = (x: number) => (x <= 0.04045 ? x / 12.92 : Math.pow((x + 0.055) / 1.055, 2.4));
  return 0.2126 * c(r) + 0.7152 * c(g) + 0.0722 * c(b);
}

function contrast(a: [number, number, number], b: [number, number, number]): number {
  const l1 = luminance(a), l2 = luminance(b);
  return (Math.max(l1, l2) + 0.05) / (Math.min(l1, l2) + 0.05);
}

function parseOklch(block: string, token: string): [number, number, number] {
  const m = block.match(new RegExp(`--${token}:\\s*oklch\\(([^)]+)\\)`));
  expect(m, `token --${token} must be oklch in frost block`).not.toBeNull();
  const [l, c, h] = m![1].trim().split(/\s+/).map((v) => parseFloat(v));
  return oklchToSrgb(l / 100, c, h);
}

function frostBlock(dark: boolean): string {
  const src = cssFile("src/styles/tokens.css");
  const selector = dark
    ? ':root[data-theme="dark"][data-theme-family="frost"]'
    : ':root[data-theme-family="frost"]';
  const idx = src.indexOf(selector + " {");
  expect(idx, `missing block ${selector}`).toBeGreaterThan(-1);
  const end = src.indexOf("}", idx);
  return src.slice(idx, end);
}

describe("frost theme contrast (WCAG AA)", () => {
  it("light: text/muted/faint pass on bg and card", () => {
    const b = frostBlock(false);
    const bg = parseOklch(b, "bg");
    const card = parseOklch(b, "bg-card");
    expect(contrast(parseOklch(b, "text"), bg)).toBeGreaterThanOrEqual(7);
    expect(contrast(parseOklch(b, "muted"), bg)).toBeGreaterThanOrEqual(4.5);
    expect(contrast(parseOklch(b, "faint"), bg)).toBeGreaterThanOrEqual(4.5);
    expect(contrast(parseOklch(b, "muted"), card)).toBeGreaterThanOrEqual(4.5);
    expect(contrast(parseOklch(b, "accent"), card)).toBeGreaterThanOrEqual(3);
  });

  it("dark: text/muted/faint pass on bg and card", () => {
    const light = frostBlock(false);
    const b = frostBlock(true);
    const bg = parseOklch(b, "bg");
    const card = parseOklch(b, "bg-card");
    expect(contrast(parseOklch(b, "text"), bg)).toBeGreaterThanOrEqual(7);
    expect(contrast(parseOklch(b, "muted"), bg)).toBeGreaterThanOrEqual(4.5);
    expect(contrast(parseOklch(b, "faint"), bg)).toBeGreaterThanOrEqual(4.5);
    expect(contrast(parseOklch(b, "accent"), card)).toBeGreaterThanOrEqual(3);
    expect(contrast(parseOklch(light, "accent"), card)).toBeGreaterThanOrEqual(3);
  });

  it("declares the full core token set in both blocks", () => {
    const core = ["bg", "bg-card", "line", "text", "muted", "faint", "accent"];
    for (const t of core) {
      expect(frostBlock(false)).toContain(`--${t}:`);
      expect(frostBlock(true)).toContain(`--${t}:`);
    }
  });
});
```

- [ ] **Step 2: 运行测试确认失败**

Run: `npx vitest run src/lib/frost-contrast.test.ts`
Expected: FAIL — `missing block :root[data-theme-family="frost"]`

- [ ] **Step 3: 实现 frost 令牌块**

在 `src/styles/tokens.css` 的 `:root[data-theme-family="ink"]` 相关块之后、`:root[data-density="compact"]` 之前插入（数值来自 spec §3，对比度已验证：light text/bg=15.45、muted/bg=5.60、faint/bg=4.83、accent/card=3.62；dark text/bg=16.00、muted/bg=7.45、faint/bg=6.52、accent/card=5.37）：

```css
:root[data-theme-family="frost"] {
  --bg: oklch(98.5% .001 286.376);
  --bg-side: oklch(96.8% .001 286);
  --bg-card: oklch(100% 0 0);
  --bg-alt: oklch(96.1% .001 286.375);
  --bg-input: oklch(96.1% .001 286.375);
  --bg-hover: oklch(24.7% .006 258.361 / 4%);
  --bg-active: oklch(24.7% .006 258.361 / 8%);
  --line: oklch(94.6% .003 264.542);
  --line-strong: oklch(24.7% .006 258.361 / 10%);
  --text: oklch(24.7% .006 258.361);
  --muted: oklch(50.6% .01 264.477);
  --faint: oklch(54.1% .01 264.484);
  --accent: oklch(62.6% .205 254.947);
  --accent-deep: oklch(55.6% .187 255.617);
  --cta: oklch(24.7% .006 258.361);
  --cta-text: oklch(98.5% .001 286.376);
  --ok: oklch(55% .12 155);
  --warn: oklch(80% .13 85);
  --danger: oklch(58% .19 25);
  --shadow: 0 0 0 1px var(--line);
  --shadow-l: 0 0 0 1px var(--line), 0 14px 44px oklch(24.7% .006 258 / 10%);
  --radius: 6px;
  --radius-xl: 10px;
  --radius-m: 14px;
  --radius-l: 20px;
}
:root[data-theme="dark"][data-theme-family="frost"] {
  --bg: oklch(20.9% .004 264.477);
  --bg-side: oklch(23.5% .005 268);
  --bg-card: oklch(26% .006 271.191);
  --bg-alt: oklch(29.3% .006 271.223);
  --bg-input: oklch(29.3% .006 271.223);
  --bg-hover: oklch(96.4% .002 247.839 / 8%);
  --bg-active: oklch(96.4% .002 247.839 / 12%);
  --line: oklch(30.8% .006 258.354);
  --line-strong: oklch(96.4% .002 247.839 / 12%);
  --text: oklch(96.4% .002 247.839);
  --muted: oklch(73.1% .008 260.731);
  --faint: oklch(69.5% .009 264.505);
  --accent: oklch(68% .173 253.301);
  --accent-deep: oklch(78.8% .113 248.33);
  --cta: oklch(96.4% .002 247.839);
  --cta-text: oklch(20.9% .004 264.477);
  --ok: oklch(72% .13 155);
  --warn: oklch(82% .12 85);
  --danger: oklch(68% .17 25);
  --shadow: 0 0 0 1px var(--line);
  --shadow-l: 0 0 0 1px var(--line), 0 14px 44px oklch(0% 0 0 / 40%);
}
```

说明：`--sheen` 等用 `var(--text)` 推导的令牌会自动取 frost 值（同元素自定义属性解析），无需重复声明；`--code-*`、`--scrollbar-*`、`--usage-*` 继承默认值，P1 视觉回归时若发现不协调再补。

- [ ] **Step 4: 运行测试确认通过**

Run: `npx vitest run src/lib/frost-contrast.test.ts`
Expected: PASS（3 个测试全绿）

- [ ] **Step 5: 提交**

```bash
git add src/styles/tokens.css src/lib/frost-contrast.test.ts
git commit -m "feat: add frost theme family color tokens with contrast tests"
```

---

### Task 2: themeFamily 接线（类型 ×5 文件、白名单、Settings 下拉、i18n）

**Files:**
- Modify: `src/Settings.tsx:71,72,265,536-540`
- Modify: `src/api.ts:60`
- Modify: `src/hooks/useWebuiPersist.ts:32`
- Modify: `src/hooks/useAppModelState.ts:49`
- Modify: `src/hooks/hydrate-webui.ts:66,156`
- Modify: `src/lib/i18n.ts`（zh 块 238 行后、en 块 939 行后）
- Test: `src/hooks/useWebuiPersist.test.ts`（追加）、`src/lib/frost-wiring.test.ts`（新建）

**Interfaces:**
- Consumes: Task 1 的 frost 令牌块（切换后才有可见效果）
- Produces: `themeFamily` 合法值全集变为 `"default" | "paper" | "ink" | "frost"`；后续任务在 CSS 中直接以 `[data-theme-family="frost"]` 为作用域，不再触碰 TS。

- [ ] **Step 1: 写失败的接线测试**

新建 `src/lib/frost-wiring.test.ts`（沿用本项目源码断言模式）：

```ts
import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";

const root = join(dirname(fileURLToPath(import.meta.url)), "../..");
const read = (rel: string) => readFileSync(join(root, rel), "utf8");

describe("frost wiring", () => {
  it("hydrate whitelist accepts frost", () => {
    expect(read("src/hooks/hydrate-webui.ts")).toMatch(/state\.themeFamily === "frost"/);
  });

  it("settings offers frost with a localized hint", () => {
    const settings = read("src/Settings.tsx");
    expect(settings).toMatch(/\{ value: "frost", label: "Frost", hint: t\(locale, "settings\.frostHint"\) \}/);
    expect(settings).toMatch(/themeFamily\?: "default" \| "paper" \| "ink" \| "frost"/);
  });

  it("i18n defines frostHint in both locales", () => {
    const i18n = read("src/lib/i18n.ts");
    expect(i18n).toMatch(/"settings\.frostHint": "冷灰"/);
    expect(i18n).toMatch(/"settings\.frostHint": "Cool gray"/);
  });

  it("all themeFamily unions include frost", () => {
    for (const rel of [
      "src/api.ts",
      "src/hooks/useWebuiPersist.ts",
      "src/hooks/useAppModelState.ts",
      "src/hooks/hydrate-webui.ts",
    ]) {
      expect(read(rel), rel).toMatch(/"default" \| "paper" \| "ink" \| "frost"/);
      expect(read(rel), rel).not.toMatch(/"default" \| "paper" \| "ink"(?! \|)/);
    }
  });
});
```

并在 `src/hooks/useWebuiPersist.test.ts` 的现有 describe 内追加（`base` 是该文件已有的 `WebuiSnapshot` 常量，`buildWebuiState` 已在该文件 import）：

```ts
it("persists the frost theme family", () => {
  const state = buildWebuiState({ ...base, themeFamily: "frost" });
  expect(state.themeFamily).toBe("frost");
});
```

- [ ] **Step 2: 运行测试确认失败**

Run: `npx vitest run src/lib/frost-wiring.test.ts src/hooks/useWebuiPersist.test.ts`
Expected: FAIL — frost-wiring 4 个全红（正则不匹配）；persist 新用例 TS 报错或断言失败

- [ ] **Step 3: 实现接线**

3a. 五个文件的联合类型统一替换 `"default" | "paper" | "ink"` → `"default" | "paper" | "ink" | "frost"`：
- `src/Settings.tsx:71`（props）、`src/Settings.tsx:72`（回调）、`src/Settings.tsx:540`（`v as` 断言）
- `src/api.ts:60`
- `src/hooks/useWebuiPersist.ts:32`
- `src/hooks/useAppModelState.ts:49`
- `src/hooks/hydrate-webui.ts:66`（`HydrateWebuiDeps.setThemeFamily` 签名）

3b. `src/hooks/hydrate-webui.ts:156` 白名单：

```ts
if (state.themeFamily === "paper" || state.themeFamily === "ink" || state.themeFamily === "default" || state.themeFamily === "frost") {
```

3c. `src/Settings.tsx` 下拉选项（536-539 行 options 数组追加第四项）：

```tsx
options={[
  { value: "default", label: t(locale, "settings.themeDefault") },
  { value: "paper", label: "Paper", hint: t(locale, "settings.paperHint") },
  { value: "ink", label: "Ink", hint: t(locale, "settings.inkHint") },
  { value: "frost", label: "Frost", hint: t(locale, "settings.frostHint") },
]}
```

3d. `src/Settings.tsx:265` 搜索 haystack 追加 frost 文案：

```ts
const appearanceFamily = show(hay("settings.themeFamily"), "默认 Paper 暖纸 Ink 高对比 Frost 冷灰 Default Warm High contrast Cool gray");
```

3e. `src/lib/i18n.ts` 两处插入——zh 块 `"settings.inkHint": "高对比",` 之后加 `"settings.frostHint": "冷灰",`；en 块 `"settings.inkHint": "High contrast",` 之后加 `"settings.frostHint": "Cool gray",`。

- [ ] **Step 4: 运行测试确认通过 + 全量类型检查**

Run: `npx vitest run src/lib/frost-wiring.test.ts src/hooks/useWebuiPersist.test.ts && npm run typecheck`
Expected: 全部 PASS；typecheck 无错误（若有遗漏的联合类型会在此暴露，逐个补 `"frost"`）

- [ ] **Step 5: 手工验证 + 提交**

Run: `npm run dev`，浏览器打开后在 Settings → 外观 → 主题族选 Frost，确认全站切换为冷灰基调、dark 模式正常、刷新后保持。

```bash
git add src/Settings.tsx src/api.ts src/hooks/useWebuiPersist.ts src/hooks/useAppModelState.ts src/hooks/hydrate-webui.ts src/lib/i18n.ts src/lib/frost-wiring.test.ts src/hooks/useWebuiPersist.test.ts
git commit -m "feat: wire frost theme family through settings, persistence and hydration"
```

---

### Task 3: frost.css 结构层 + 注册 + 作用域守卫测试

**Files:**
- Create: `src/styles/frost.css`
- Modify: `src/main.tsx`（import 列表末尾追加）
- Modify: `src/lib/css-source.ts`（`APP_STYLE_FILES` 末尾追加）
- Test: `src/lib/frost-css.test.ts`（新建）

**Interfaces:**
- Consumes: Task 1 的 frost 令牌（规则内只用 `var(--line)`、`var(--radius-*)` 等，禁止写死颜色）
- Produces: 作用域覆盖模式 `:root[data-theme-family="frost"] <selector>`，Task 12 视觉回归以此为准。

- [ ] **Step 1: 写失败的作用域守卫测试**

新建 `src/lib/frost-css.test.ts`：

```ts
import { describe, expect, it } from "vitest";
import { APP_STYLE_FILES, cssFile } from "./css-source";

const PREFIX = ':root[data-theme-family="frost"]';

function selectorLines(src: string): string[] {
  return src
    .split("\n")
    .map((l) => l.trim())
    .filter((l) => l && !l.startsWith("/*") && !l.startsWith("*") && !l.startsWith("}") && !l.startsWith("@"))
    .filter((l) => /[,{]/.test(l) && !l.startsWith(":root {"))
    .filter((l) => !l.includes(":") || /^[.:[]|\w/.test(l) || l.startsWith(PREFIX));
}

describe("frost.css scope guard", () => {
  it("every selector is scoped to the frost theme family", () => {
    const src = cssFile("src/styles/frost.css");
    const selectors = src
      .split("\n")
      .map((l) => l.trim())
      .filter((l) => l.endsWith("{") && !l.startsWith("@") && !l.startsWith("/*"));
    expect(selectors.length).toBeGreaterThan(8);
    for (const s of selectors) {
      for (const part of s.replace(/\{$/, "").split(",")) {
        expect(part.trim().startsWith(PREFIX), `unscoped selector: ${part}`).toBe(true);
      }
    }
  });

  it("carries the structural motifs from the spec", () => {
    const src = cssFile("src/styles/frost.css");
    expect(src).toMatch(/border-top-style: dashed|1px dashed/);       // 虚线分隔
    expect(src).toMatch(/box-shadow: 0 0 0 1px var\(--line\)/);        // 描边代阴影
    expect(src).toMatch(/border-radius: 999px/);                        // 胶囊
    expect(src).toMatch(/radial-gradient\(var\(--line\) 1px/);          // 点状画布
    expect(src).toMatch(/font-size: 11\.5px/);                          // 紧凑辅助字
  });

  it("is registered in main.tsx and css-source.ts", () => {
    expect(APP_STYLE_FILES).toContain("src/styles/frost.css");
    expect(cssFile("src/main.tsx")).toContain('./styles/frost.css');
  });
});
```

- [ ] **Step 2: 运行测试确认失败**

Run: `npx vitest run src/lib/frost-css.test.ts`
Expected: FAIL — `ENOENT ... frost.css`

- [ ] **Step 3: 实现 frost.css 并注册**

新建 `src/styles/frost.css`（选择器全部来自现有 CSS 已确认的类名；`color-mix` 保证 light/dark 通用）：

```css
/* frost theme family — structural overrides (spec §4).
   EVERY selector must start with :root[data-theme-family="frost"]. */

/* ---- dashed separators ---- */
:root[data-theme-family="frost"] .md hr { border-top: 1px dashed var(--line); }
:root[data-theme-family="frost"] .palette-input { border-bottom: 1px dashed var(--line); }
:root[data-theme-family="frost"] .composer-meta-row { border-top: 1px dashed var(--line); }
:root[data-theme-family="frost"] .session-batch { border-top: 1px dashed var(--line); }
:root[data-theme-family="frost"] .set-row + .set-row { border-top: 1px dashed var(--line); }

/* ---- hairline ring instead of heavy shadow ---- */
:root[data-theme-family="frost"] .palette,
:root[data-theme-family="frost"] .settings-dialog,
:root[data-theme-family="frost"] .composer { box-shadow: 0 0 0 1px var(--line), var(--shadow-l); }
:root[data-theme-family="frost"] .tool-result { box-shadow: 0 0 0 1px var(--line); }

/* ---- pill controls ---- */
:root[data-theme-family="frost"] .toggle,
:root[data-theme-family="frost"] .toggle i,
:root[data-theme-family="frost"] .agent-chip,
:root[data-theme-family="frost"] .mode-chip,
:root[data-theme-family="frost"] .composer-chips > * { border-radius: 999px; }

/* ---- compact secondary labels ---- */
:root[data-theme-family="frost"] .ws-band-label {
  font-size: 11.5px;
  letter-spacing: 0.01em;
  color: var(--faint);
}

/* ---- dotted canvas ---- */
:root[data-theme-family="frost"] .mermaid-view {
  background-image: radial-gradient(var(--line) 1px, transparent 1px);
  background-size: 16px 16px;
  border-radius: var(--radius);
}
```

注册两处：
- `src/main.tsx`：在 `import "./styles/review.css";` 之后追加 `import "./styles/frost.css";`（末位加载，同级特异性时后到优先）
- `src/lib/css-source.ts`：`APP_STYLE_FILES` 数组 `"src/styles/review.css",` 之后追加 `"src/styles/frost.css",`

- [ ] **Step 4: 运行测试确认通过**

Run: `npx vitest run src/lib/frost-css.test.ts && npm test`
Expected: frost-css PASS；全量套件无回归（css-source 的既有消费者会看到新文件，若有快照类断言失败按新文件列表修正）

- [ ] **Step 5: 提交**

```bash
git add src/styles/frost.css src/main.tsx src/lib/css-source.ts src/lib/frost-css.test.ts
git commit -m "feat: add frost structural override layer with scope guard test"
```

---

### Task 4: Skeleton shimmer 扫光（全局动效）

**Files:**
- Modify: `src/styles.css`（`.skeleton` 块，约 37-48 行）
- Test: `src/lib/frost-css.test.ts`（追加 describe）

**Interfaces:**
- Consumes: `--text`、`--dur` 令牌；现有 `.skeleton` 的 `--i` 交错变量（`Skeleton.tsx` 已注入）
- Produces: `@keyframes skeleton-shimmer`（后续文档引用此名）

- [ ] **Step 1: 写失败测试**

在 `src/lib/frost-css.test.ts` 追加（注意此块断言的是 `src/styles.css`，不受 frost 作用域守卫约束）：

```ts
describe("skeleton shimmer", () => {
  it("sweeps via transform on a clipped pseudo-element", () => {
    const src = cssFile("src/styles.css");
    expect(src).toMatch(/\.skeleton\s*\{[^}]*overflow: hidden/);
    expect(src).toMatch(/\.skeleton::after\s*\{/);
    const kf = src.match(/@keyframes skeleton-shimmer\s*\{[\s\S]*?\n\}/)?.[0] ?? "";
    expect(kf).toMatch(/transform: translateX\(/);
    expect(kf).not.toMatch(/background-position/);
  });
});
```

Run: `npx vitest run src/lib/frost-css.test.ts` → Expected: FAIL（新断言不匹配）

- [ ] **Step 2: 实现**

修改 `src/styles.css` 的 `.skeleton` 块并追加伪元素与关键帧（保留现有 pulse 动画与 `--i` 交错）：

```css
.skeleton {
  position: relative;
  overflow: hidden;
  height: 12px;
  border-radius: 6px;
  background: color-mix(in srgb, var(--text) 8%, transparent);
  animation: skeleton-pulse 1.2s var(--ease-in-out) infinite;
  animation-delay: calc(var(--i, 0) * 80ms);
}
.skeleton::after {
  content: "";
  position: absolute;
  inset: 0;
  background: linear-gradient(90deg, transparent, color-mix(in srgb, var(--text) 10%, transparent), transparent);
  transform: translateX(-100%);
  animation: skeleton-shimmer 1.6s var(--ease-in-out) infinite;
  animation-delay: calc(var(--i, 0) * 80ms);
}
@keyframes skeleton-shimmer {
  to { transform: translateX(100%); }
}
```

- [ ] **Step 3: 运行测试确认通过**

Run: `npx vitest run src/lib/frost-css.test.ts src/lib/css-review.test.ts`
Expected: PASS（css-review 的 reduced-motion 断言不受影响：shimmer 属装饰性动效，被全局 reduce 开关正常杀掉，无需豁免）

- [ ] **Step 4: 提交**

```bash
git add src/styles.css src/lib/frost-css.test.ts
git commit -m "feat: add transform-based shimmer sweep to skeleton loader"
```

---

### Task 5: Thinking 轨迹入场动效（spine/fold）

**Files:**
- Modify: `src/styles/thread.css`（`.spine-body` 相关块，约 649 行附近）
- Test: `src/lib/frost-css.test.ts`（追加 describe）

**Interfaces:**
- Consumes: 现有 DOM——`WorkTimeline.tsx:69` 在 `open` 时挂载 `.spine-body`（条件渲染，入场动画即生效，无需 TS 改动）；`Thread.tsx:160` 的 `.fold.open`
- Produces: `@keyframes spine-enter`

- [ ] **Step 1: 写失败测试**

在 `src/lib/frost-css.test.ts` 追加：

```ts
describe("spine enter motion", () => {
  it("animates spine-body entry with transform/opacity only", () => {
    const src = cssFile("src/styles/thread.css");
    expect(src).toMatch(/\.spine-body\s*\{[^}]*animation:\s*spine-enter/);
    const kf = src.match(/@keyframes spine-enter\s*\{[\s\S]*?\n\}/)?.[0] ?? "";
    expect(kf).toMatch(/opacity/);
    expect(kf).toMatch(/translateY/);
    expect(kf).not.toMatch(/height|margin|padding/);
  });
});
```

Run: `npx vitest run src/lib/frost-css.test.ts` → Expected: FAIL

- [ ] **Step 2: 实现**

在 `src/styles/thread.css` 的 `.spine-body` 规则中追加 `animation: spine-enter var(--dur) var(--ease);`，并在文件末尾追加：

```css
@keyframes spine-enter {
  from { opacity: 0; transform: translateY(-4px); }
  to { opacity: 1; transform: translateY(0); }
}
.fold.open > * { animation: spine-enter var(--dur) var(--ease); }
```

- [ ] **Step 3: 运行测试确认通过**

Run: `npx vitest run src/lib/frost-css.test.ts` → Expected: PASS

- [ ] **Step 4: 提交**

```bash
git add src/styles/thread.css src/lib/frost-css.test.ts
git commit -m "feat: animate thinking-trace expansion in work timeline and folds"
```

---

### Task 6: 流式光标 + tool chip 悬停抬升

**Files:**
- Modify: `src/components/Markdown.tsx:38`（根 div 加 `data-live` 钩子）
- Modify: `src/styles/thread.css`（`.tool-result` 块约 407 行；文件末尾加光标样式）
- Test: `src/lib/frost-css.test.ts`（追加 describe）

**Interfaces:**
- Consumes: `Markdown.tsx` 现有 `live?: boolean` prop（`Thread.tsx:237` 已传 `live={!showCopy}`）
- Produces: DOM 钩子 `.md[data-live]`；`@keyframes caret-blink`

- [ ] **Step 1: 写失败测试**

在 `src/lib/frost-css.test.ts` 追加：

```ts
import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const repoRoot = join(dirname(fileURLToPath(import.meta.url)), "../..");

describe("streaming caret and tool chip hover", () => {
  it("Markdown exposes a data-live hook", () => {
    const src = readFileSync(join(repoRoot, "src/components/Markdown.tsx"), "utf8");
    expect(src).toMatch(/data-live=\{live \? "" : undefined\}/);
  });

  it("renders a blinking block caret on the last streamed node", () => {
    const src = cssFile("src/styles/thread.css");
    expect(src).toMatch(/\.md\[data-live\] > \*:last-child::after\s*\{/);
    const kf = src.match(/@keyframes caret-blink\s*\{[\s\S]*?\n\}/)?.[0] ?? "";
    expect(kf).toMatch(/opacity/);
  });

  it("lifts tool-result on hover", () => {
    const src = cssFile("src/styles/thread.css");
    expect(src).toMatch(/\.tool-result:hover\s*\{[^}]*translateY\(-1px\)/);
  });
});
```

Run: `npx vitest run src/lib/frost-css.test.ts` → Expected: FAIL

- [ ] **Step 2: 实现**

2a. `src/components/Markdown.tsx:38`，根 div 改为：

```tsx
<div className={className} data-live={live ? "" : undefined} onClick={onClick}>
```

2b. `src/styles/thread.css` 末尾追加：

```css
/* ---- streaming caret ---- */
.md[data-live] > *:last-child::after {
  content: "";
  display: inline-block;
  width: 0.55em;
  height: 1.05em;
  margin-left: 2px;
  vertical-align: text-bottom;
  background: var(--accent);
  border-radius: 1px;
  animation: caret-blink 1s steps(2, start) infinite;
}
@keyframes caret-blink {
  50% { opacity: 0; }
}

/* ---- tool chip hover lift ---- */
.tool-result { transition: transform var(--dur-fast) var(--ease), box-shadow var(--dur-fast) var(--ease); }
.tool-result:hover { transform: translateY(-1px); box-shadow: var(--shadow); }
```

- [ ] **Step 3: 运行测试确认通过 + 类型检查**

Run: `npx vitest run src/lib/frost-css.test.ts && npm run typecheck`
Expected: PASS

- [ ] **Step 4: 提交**

```bash
git add src/components/Markdown.tsx src/styles/thread.css src/lib/frost-css.test.ts
git commit -m "feat: add streaming caret and tool-result hover lift"
```

---

### Task 7: Sidebar 滑动悬停指示层（glide）

**Files:**
- Modify: `src/components/Sidebar.tsx`（约 620 行 `.session-list` 容器）
- Modify: `src/styles/sidebar.css`（`.session-list` 块约 104 行；文件末尾追加）
- Test: `src/components/Sidebar.test.tsx`（追加，沿用该文件 `renderToStaticMarkup` 模式）

**Interfaces:**
- Consumes: 现有 `.session-list` / `.session` DOM（`Sidebar.tsx:620` 起）
- Produces: DOM 钩子 `.session-glide`（span, aria-hidden）+ 容器 CSS 变量 `--glide-y` / `--glide-h` + 容器类 `.gliding`

- [ ] **Step 1: 写失败测试**

在 `src/components/Sidebar.test.tsx` 追加（复用该文件现有的 `session()` / `projectSection()` 工厂与 Sidebar 渲染方式，参考文件内既有用例的 props 组装）：

```ts
it("renders the glide hover indicator inside the session list", () => {
  const html = renderToStaticMarkup(/* 按文件内既有用例相同方式渲染 Sidebar，传入 projectSection(3) */);
  expect(html).toContain('class="session-glide"');
  expect(html.indexOf('session-glide')).toBeLessThan(html.indexOf('class="session"'));
});
```

注意：断言指示层是列表第一个子元素（z-index 之下的背景层）。渲染调用必须照抄同文件既有用例的 Sidebar props 组装，仅数据用 `projectSection(3)`。

Run: `npx vitest run src/components/Sidebar.test.tsx` → Expected: FAIL（无 session-glide）

- [ ] **Step 2: 实现**

2a. `Sidebar.tsx`：组件内加 ref 与事件处理（React import 已有；`useRef` 若未 import 则加入）：

```tsx
const listRef = useRef<HTMLDivElement>(null);

function moveGlide(e: React.MouseEvent<HTMLDivElement>) {
  const list = listRef.current;
  if (!list) return;
  const item = (e.target as HTMLElement).closest(".session");
  if (!item || !(item instanceof HTMLElement) || !list.contains(item)) {
    list.classList.remove("gliding");
    return;
  }
  list.style.setProperty("--glide-y", `${item.offsetTop}px`);
  list.style.setProperty("--glide-h", `${item.offsetHeight}px`);
  list.classList.add("gliding");
}

function hideGlide() {
  listRef.current?.classList.remove("gliding");
}
```

在 620 行的 `.session-list` div 上挂 `ref={listRef} onMouseOver={moveGlide} onMouseLeave={hideGlide}`，并把 `<span className="session-glide" aria-hidden="true" />` 作为其第一个子元素。若该 div 处于 react-window 虚拟化分支（同文件存在多个 `.session-list` 渲染点），对每个渲染点同样处理；滚动时指示层跟随列表内容（其为列表内绝对定位子元素，天然跟随）。

2b. `src/styles/sidebar.css` 末尾追加：

```css
/* ---- gliding hover indicator ---- */
.session-list { position: relative; }
.session-glide {
  position: absolute;
  left: 4px;
  right: 4px;
  top: 0;
  height: var(--glide-h, 0px);
  transform: translateY(var(--glide-y, 0px));
  background: var(--bg-hover);
  border-radius: var(--radius);
  opacity: 0;
  transition:
    transform var(--dur) var(--ease),
    height var(--dur) var(--ease),
    opacity var(--dur-fast) linear;
  pointer-events: none;
  z-index: 0;
}
.session-list.gliding .session-glide { opacity: 1; }
.session-list > .session { position: relative; z-index: 1; }
```

- [ ] **Step 3: 运行测试确认通过**

Run: `npx vitest run src/components/Sidebar.test.tsx && npm run typecheck`
Expected: PASS

- [ ] **Step 4: 手工验证 + 提交**

`npm run dev`：悬停在侧栏会话条目间快速移动，确认指示层平滑滑行、无布局抖动（DevTools Performance 面板无 forced reflow 风暴；每次 mouseover 仅一次 offsetTop 读取，可接受）。

```bash
git add src/components/Sidebar.tsx src/styles/sidebar.css src/components/Sidebar.test.tsx
git commit -m "feat: add gliding hover indicator to sidebar session list"
```

---

### Task 8: Composer 焦点环 + chips 入场 + Palette 空状态

**Files:**
- Modify: `src/styles/composer.css`（`.composer:focus-within`、`.composer-chips`）
- Modify: `src/styles/palette.css`（`.palette-empty`，选择器已确认存在于 `CommandPalette.tsx:116`）
- Test: `src/lib/frost-css.test.ts`（追加 describe）

**Interfaces:**
- Consumes: 现有约束——`css-review.test.ts` 断言 `.composer:focus-within { border-color: ... }` 必须保留（只增不删）
- Produces: `@keyframes chip-in`

- [ ] **Step 1: 写失败测试**

在 `src/lib/frost-css.test.ts` 追加：

```ts
describe("composer and palette polish", () => {
  it("adds an accent focus ring while keeping the border-color rule", () => {
    const src = cssFile("src/styles/composer.css");
    expect(src).toMatch(/\.composer:focus-within\s*\{[^}]*border-color:/);
    expect(src).toMatch(/\.composer:focus-within\s*\{[^}]*box-shadow: 0 0 0 1px var\(--accent\)/);
  });

  it("animates chip entry with transform/opacity", () => {
    const src = cssFile("src/styles/composer.css");
    expect(src).toMatch(/\.composer-chips > \*\s*\{[^}]*animation:\s*chip-in/);
    const kf = src.match(/@keyframes chip-in\s*\{[\s\S]*?\n\}/)?.[0] ?? "";
    expect(kf).toMatch(/translateY/);
    expect(kf).toMatch(/opacity/);
  });

  it("gives the palette empty state a dashed ring", () => {
    const src = cssFile("src/styles/palette.css");
    expect(src).toMatch(/\.palette-empty\s*\{[^}]*1px dashed var\(--line\)/);
  });
});
```

Run: `npx vitest run src/lib/frost-css.test.ts` → Expected: FAIL

- [ ] **Step 2: 实现**

`src/styles/composer.css`——在现有 `.composer:focus-within` 规则内追加一行 `box-shadow: 0 0 0 1px var(--accent);`（保留 border-color 声明）；`.composer-chips > *` 追加 `animation: chip-in var(--dur) var(--ease);`；文件末尾：

```css
@keyframes chip-in {
  from { opacity: 0; transform: translateY(4px); }
  to { opacity: 1; transform: translateY(0); }
}
```

`src/styles/palette.css`——`.palette-empty` 规则追加/新建：

```css
.palette-empty {
  margin: 24px 16px;
  padding: 28px 16px;
  text-align: center;
  color: var(--faint);
  border: 1px dashed var(--line);
  border-radius: var(--radius-m);
  animation: rise-in var(--dur) var(--ease);
}
```

（`rise-in` 关键帧已存在于项目 CSS——`palette.css` 的 `.palette` 规则在用；若 grep 确认其定义在别的文件也能全局生效。）

- [ ] **Step 3: 运行测试确认通过**

Run: `npx vitest run src/lib/frost-css.test.ts src/lib/css-review.test.ts`
Expected: PASS（css-review 的 composer 焦点断言不回归）

- [ ] **Step 4: 提交**

```bash
git add src/styles/composer.css src/styles/palette.css src/lib/frost-css.test.ts
git commit -m "feat: composer focus ring, chip entry animation, palette empty state"
```

---

### Task 9: Work-run 运行进度条（状态性动效 + reduce 豁免）

**Files:**
- Modify: `src/styles/thread.css`（`.work-run` 系列样式所在，grep 确认在 thread.css 与 styles.css）
- Modify: `src/styles.css`（reduced-motion 豁免块，约 290 行起）
- Test: `src/lib/frost-css.test.ts`（追加 describe）

**Interfaces:**
- Consumes: 现有 DOM——`WorkRun.tsx:33` 的 `.work-run.live` / `.failed` 状态类与 `.work-run-bar` 子元素
- Produces: `@keyframes run-progress`

- [ ] **Step 1: 写失败测试**

在 `src/lib/frost-css.test.ts` 追加：

```ts
describe("work-run progress", () => {
  it("shows an indeterminate accent bar while live", () => {
    const src = cssFile("src/styles/thread.css");
    expect(src).toMatch(/\.work-run\.live \.work-run-bar::after\s*\{/);
    const kf = src.match(/@keyframes run-progress\s*\{[\s\S]*?\n\}/)?.[0] ?? "";
    expect(kf).toMatch(/transform/);
    expect(kf).not.toMatch(/width|left:/);
  });

  it("is exempted from the reduced-motion kill switch like the spinner", () => {
    const src = cssFile("src/styles.css");
    const idx = src.indexOf("@media (prefers-reduced-motion: reduce)");
    const chunk = src.slice(idx, idx + 2200);
    expect(chunk).toMatch(/run-progress[\s\S]*infinite/);
  });
});
```

Run: `npx vitest run src/lib/frost-css.test.ts` → Expected: FAIL

- [ ] **Step 2: 实现**

2a. `src/styles/thread.css` 末尾追加：

```css
/* ---- live run progress ---- */
.work-run-bar { position: relative; }
.work-run.live .work-run-bar::after {
  content: "";
  position: absolute;
  left: 0;
  right: 0;
  bottom: 0;
  height: 2px;
  background: var(--accent);
  transform-origin: left center;
  animation: run-progress 1.6s var(--ease-in-out) infinite;
}
@keyframes run-progress {
  0% { transform: scaleX(0); }
  55% { transform: scaleX(0.85); }
  100% { transform: scaleX(1); opacity: 0.35; }
}
```

2b. `src/styles.css` 的 reduced-motion 块内、现有 `.spinner` 豁免规则旁追加同样的豁免（状态性动效须存活，模式照抄 spinner 豁免的写法）：

```css
.work-run.live .work-run-bar::after {
  animation: run-progress 1.6s var(--ease-in-out) infinite !important;
}
```

- [ ] **Step 3: 运行测试确认通过**

Run: `npx vitest run src/lib/frost-css.test.ts src/lib/css-review.test.ts`
Expected: PASS

- [ ] **Step 4: 提交**

```bash
git add src/styles/thread.css src/styles.css src/lib/frost-css.test.ts
git commit -m "feat: indeterminate progress bar on live work runs with reduced-motion exemption"
```

---

### Task 9b: 卡片/消息/代码块动效补齐（spec §5 剩余纯 CSS 行）

**Files:**
- Modify: `src/styles/thread.css`（末尾追加）
- Modify: `src/styles/frost.css`（末尾追加两条结构规则）
- Modify: `.recap-card` / `.file-item` 基础样式所在的 CSS 文件（Step 2 用 grep 定位）
- Test: `src/lib/frost-css.test.ts`（追加 describe）

**Interfaces:**
- Consumes: 现有 DOM——`.permission`（`PermissionCard.tsx:111` / `QuestionCard.tsx:51` / `PlanCompleteCard.tsx:26` 共用根类）、`.perm-opt`、`.recap-card`（`RecapCard.tsx:18`）、`.file-item`（`ContextPanel.tsx:62`）、`.diff-summary-inner`（`DiffSummary.tsx:18`）、`.md pre`（thread.css:223）；Task 5 的 `@keyframes spine-enter` 与 Task 8 的 `@keyframes chip-in`（keyframes 全局作用域，跨文件可引用）
- Produces: 无新接口（终态样式）

- [ ] **Step 1: 写失败测试**

在 `src/lib/frost-css.test.ts` 追加：

```ts
describe("cards and messages motion", () => {
  it("animates the newest message and permission cards on entry", () => {
    const src = cssFile("src/styles/thread.css");
    expect(src).toMatch(/\.thread \.msg:last-child\s*\{[^}]*animation:\s*spine-enter/);
    expect(src).toMatch(/\.permission\s*\{[^}]*animation:\s*spine-enter/);
  });

  it("stagger-animates diff summary chips", () => {
    const src = cssFile("src/styles/thread.css");
    expect(src).toMatch(/\.diff-summary-inner > \*\s*\{[^}]*animation:\s*chip-in[^}]*backwards/);
    expect(src).toMatch(/\.diff-summary-inner > \*:nth-child\(2\)\s*\{[^}]*animation-delay/);
  });

  it("rings code blocks on hover", () => {
    const src = cssFile("src/styles/thread.css");
    expect(src).toMatch(/\.md pre:hover\s*\{[^}]*box-shadow: 0 0 0 1px var\(--line-strong\)/);
  });

  it("gives frost permission cards a hairline ring and pill buttons", () => {
    const src = cssFile("src/styles/frost.css");
    expect(src).toMatch(/:root\[data-theme-family="frost"\] \.permission\s*\{[^}]*box-shadow: 0 0 0 1px var\(--line\)/);
    expect(src).toMatch(/:root\[data-theme-family="frost"\] \.permission \.btn[^{]*\{[^}]*border-radius: 999px/);
  });
});
```

Run: `npx vitest run src/lib/frost-css.test.ts` → Expected: FAIL

- [ ] **Step 2: 实现**

2a. `src/styles/thread.css` 末尾追加（`.msg` 只对最后一条做入场动画：虚拟滚动 `.chat.virtualized` 下重挂载全部消息会导致滚动闪烁，限定 `:last-child` 规避）：

```css
/* ---- entry + hover polish (spec §5.1/§5.2/§5.3 remainder) ---- */
.thread .msg:last-child { animation: spine-enter var(--dur) var(--ease); }
.permission { animation: spine-enter var(--dur) var(--ease); }
.diff-summary-inner > * { animation: chip-in var(--dur) var(--ease) backwards; }
.diff-summary-inner > *:nth-child(2) { animation-delay: 40ms; }
.diff-summary-inner > *:nth-child(3) { animation-delay: 80ms; }
.md pre { transition: box-shadow var(--dur-fast) var(--ease); }
.md pre:hover { box-shadow: 0 0 0 1px var(--line-strong); }
```

2b. `src/styles/frost.css` 末尾追加：

```css
:root[data-theme-family="frost"] .permission { box-shadow: 0 0 0 1px var(--line); }
:root[data-theme-family="frost"] .permission .btn,
:root[data-theme-family="frost"] .perm-opt { border-radius: 999px; }
```

2c. 卡片悬停抬升——先定位基础样式文件：

```bash
grep -ln "recap-card" src/styles/*.css src/styles.css
grep -ln "\.file-item" src/styles/*.css src/styles.css
```

在各自命中文件的末尾追加（若两规则命中同一文件则合并写一处）：

```css
.recap-card { transition: transform var(--dur-fast) var(--ease), box-shadow var(--dur-fast) var(--ease); }
.recap-card:hover { transform: translateY(-1px); box-shadow: var(--shadow); }
.file-item { transition: transform var(--dur-fast) var(--ease), box-shadow var(--dur-fast) var(--ease); }
.file-item:hover { transform: translateY(-1px); box-shadow: var(--shadow); }
```

- [ ] **Step 3: 运行测试确认通过**

Run: `npx vitest run src/lib/frost-css.test.ts src/lib/css-review.test.ts && npm test`
Expected: PASS，无回归

- [ ] **Step 4: 提交**

```bash
git add src/styles/thread.css src/styles/frost.css src/lib/frost-css.test.ts
git commit -m "feat: entry and hover motion for messages, permission cards, diffs and code blocks"
```

（若 Step 2c 修改了其他样式文件，一并 `git add`。）

---

### Task 10: Selection Actions 纯逻辑（TDD）

**Files:**
- Create: `src/lib/selection-actions.ts`
- Test: `src/lib/selection-actions.test.ts`（新建）

**Interfaces:**
- Consumes: 无（纯函数）
- Produces（Task 11 依赖，签名必须一致）:
  - `interface Rect { top: number; left: number; width: number; height: number }`
  - `interface Placement { x: number; y: number; flipped: boolean }`
  - `toolbarPlacement(sel: Rect, viewport: { width: number; height: number }, toolbar: { width: number; height: number }, gap?: number): Placement`
  - `formatQuote(text: string): string`
  - `composeRewriteDraft(quote: string, locale: "zh" | "en"): string`
  - `TOOLBAR_W = 220`, `TOOLBAR_H = 36`（常量，供 hook 使用）

- [ ] **Step 1: 写失败的测试**

新建 `src/lib/selection-actions.test.ts`：

```ts
import { describe, expect, it } from "vitest";
import { composeRewriteDraft, formatQuote, toolbarPlacement, TOOLBAR_H, TOOLBAR_W } from "./selection-actions";

const viewport = { width: 1280, height: 800 };
const toolbar = { width: TOOLBAR_W, height: TOOLBAR_H };

describe("toolbarPlacement", () => {
  it("centers above the selection", () => {
    const p = toolbarPlacement({ top: 300, left: 400, width: 200, height: 20 }, viewport, toolbar);
    expect(p).toEqual({ x: 400 + 100 - TOOLBAR_W / 2, y: 300 - TOOLBAR_H - 8, flipped: false });
  });

  it("flips below when there is no room above", () => {
    const p = toolbarPlacement({ top: 20, left: 400, width: 200, height: 20 }, viewport, toolbar);
    expect(p.flipped).toBe(true);
    expect(p.y).toBe(20 + 20 + 8);
  });

  it("clamps horizontally into the viewport", () => {
    const left = toolbarPlacement({ top: 300, left: 10, width: 60, height: 20 }, viewport, toolbar);
    expect(left.x).toBe(8);
    const right = toolbarPlacement({ top: 300, left: 1200, width: 70, height: 20 }, viewport, toolbar);
    expect(right.x).toBe(1280 - TOOLBAR_W - 8);
  });
});

describe("formatQuote", () => {
  it("prefixes every line with blockquote marker", () => {
    expect(formatQuote("a\nb")).toBe("> a\n> b");
  });

  it("trims surrounding whitespace and drops empty lines at the edges", () => {
    expect(formatQuote("  hello  \n")).toBe("> hello");
  });
});

describe("composeRewriteDraft", () => {
  it("builds a zh draft with the quote and a rewrite instruction", () => {
    const draft = composeRewriteDraft(formatQuote("hello"), "zh");
    expect(draft).toContain("> hello");
    expect(draft).toContain("改写");
  });

  it("builds an en draft", () => {
    const draft = composeRewriteDraft(formatQuote("hello"), "en");
    expect(draft).toContain("> hello");
    expect(draft).toMatch(/rewrite/i);
  });
});
```

- [ ] **Step 2: 运行测试确认失败**

Run: `npx vitest run src/lib/selection-actions.test.ts`
Expected: FAIL — 模块不存在

- [ ] **Step 3: 实现**

新建 `src/lib/selection-actions.ts`：

```ts
/** Pure logic for the Selection Actions toolbar (spec §6). */
import type { Locale } from "./i18n";

export interface Rect {
  top: number;
  left: number;
  width: number;
  height: number;
}

export interface Placement {
  x: number;
  y: number;
  flipped: boolean;
}

export const TOOLBAR_W = 220;
export const TOOLBAR_H = 36;
const EDGE_MARGIN = 8;

export function toolbarPlacement(
  sel: Rect,
  viewport: { width: number; height: number },
  toolbar: { width: number; height: number },
  gap = 8,
): Placement {
  const centered = sel.left + sel.width / 2 - toolbar.width / 2;
  const x = Math.min(
    Math.max(centered, EDGE_MARGIN),
    Math.max(EDGE_MARGIN, viewport.width - toolbar.width - EDGE_MARGIN),
  );
  const above = sel.top - toolbar.height - gap;
  const flipped = above < EDGE_MARGIN;
  const y = flipped ? sel.top + sel.height + gap : above;
  return { x, y, flipped };
}

export function formatQuote(text: string): string {
  return text
    .trim()
    .split("\n")
    .map((line) => `> ${line.trimEnd()}`)
    .join("\n");
}

export function composeRewriteDraft(quote: string, locale: Locale): string {
  const instruction = locale === "en" ? "Rewrite the passage above:" : "改写上面这段：";
  return `${quote}\n\n${instruction}`;
}
```

注意：`Locale` 从 `./i18n` 导入（`hydrate-webui.ts:13` 已有同样用法 `import { normalizeLocale, type Locale } from "../lib/i18n"`，在 lib 目录内则为 `./i18n`）。

- [ ] **Step 4: 运行测试确认通过**

Run: `npx vitest run src/lib/selection-actions.test.ts`
Expected: PASS（9 个用例）

- [ ] **Step 5: 提交**

```bash
git add src/lib/selection-actions.ts src/lib/selection-actions.test.ts
git commit -m "feat: add selection-actions pure logic (placement, quote, rewrite draft)"
```

---

### Task 11: SelectionActions 组件 + useTextSelection hook + App 挂载 + i18n

**Files:**
- Create: `src/hooks/useTextSelection.ts`
- Create: `src/components/SelectionActions.tsx`
- Create: `src/components/SelectionActions.test.tsx`
- Modify: `src/App.tsx`（主界面 `.chat-shell` 区域附近挂载，约 943 行外层容器末尾）
- Modify: `src/styles/thread.css`（末尾追加工具条样式）
- Modify: `src/lib/i18n.ts`（zh/en 各 4 个键）

**Interfaces:**
- Consumes: Task 10 的 `toolbarPlacement/formatQuote/composeRewriteDraft/TOOLBAR_W/TOOLBAR_H/Rect/Placement`；`useAppModelState.ts:85` 的 `setDraft`；现有 DOM `.msg.assistant`（`Thread.tsx:231`）与 `.composer textarea`
- Produces: `<SelectionActions onRewrite onQuote />` 组件；i18n 键 `selection.rewrite/selection.quote/selection.copy/selection.copied`

- [ ] **Step 1: 写失败的组件测试**

新建 `src/components/SelectionActions.test.tsx`（沿用 `Sidebar.test.tsx` 的 `renderToStaticMarkup` 模式；`LocaleProvider` 用法照抄该文件头部 import）：

```tsx
import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";
import { LocaleProvider } from "../lib/locale-context";
import { SelectionActions } from "./SelectionActions";

function render(state: { text: string; rect: { top: number; left: number; width: number; height: number } } | null) {
  return renderToStaticMarkup(
    createElement(LocaleProvider, { locale: "zh" },
      createElement(SelectionActions, {
        state,
        viewport: { width: 1280, height: 800 },
        locale: "zh",
        onRewrite: () => {},
        onQuote: () => {},
      }),
    ),
  );
}

describe("SelectionActions", () => {
  it("renders nothing without a selection", () => {
    expect(render(null)).toBe("");
  });

  it("renders a toolbar with three actions", () => {
    const html = render({ text: "hello", rect: { top: 300, left: 400, width: 120, height: 18 } });
    expect(html).toContain('role="toolbar"');
    expect(html).toContain("改写");
    expect(html).toContain("引用");
    expect(html).toContain("复制");
  });
});
```

注意：`LocaleProvider` 的 props 形态以 `src/lib/locale-context.tsx` 实际导出为准（Sidebar.test.tsx 里有现成用法，照抄其 props 组装方式）。

- [ ] **Step 2: 运行测试确认失败**

Run: `npx vitest run src/components/SelectionActions.test.tsx`
Expected: FAIL — 模块不存在

- [ ] **Step 3: 实现 hook**

新建 `src/hooks/useTextSelection.ts`：

```ts
import { useEffect, useState } from "react";
import type { Rect } from "../lib/selection-actions";

export interface TextSelectionState {
  text: string;
  rect: Rect;
}

/** Watches document selection; surfaces non-collapsed selections fully inside an assistant message. */
export function useTextSelection(): TextSelectionState | null {
  const [state, setState] = useState<TextSelectionState | null>(null);

  useEffect(() => {
    function read() {
      const sel = document.getSelection();
      if (!sel || sel.isCollapsed || sel.rangeCount === 0) {
        setState(null);
        return;
      }
      const anchor = sel.anchorNode instanceof Element ? sel.anchorNode : sel.anchorNode?.parentElement;
      const focus = sel.focusNode instanceof Element ? sel.focusNode : sel.focusNode?.parentElement;
      if (!anchor?.closest(".msg.assistant") || !focus?.closest(".msg.assistant")) {
        setState(null);
        return;
      }
      const text = sel.toString().trim();
      if (!text) {
        setState(null);
        return;
      }
      const r = sel.getRangeAt(0).getBoundingClientRect();
      if (r.width === 0 && r.height === 0) {
        setState(null);
        return;
      }
      setState({ text, rect: { top: r.top, left: r.left, width: r.width, height: r.height } });
    }

    function clear() {
      setState(null);
    }
    function onKey(e: KeyboardEvent) {
      if (e.key === "Escape") clear();
    }

    document.addEventListener("selectionchange", read);
    document.addEventListener("scroll", clear, true);
    document.addEventListener("keydown", onKey);
    return () => {
      document.removeEventListener("selectionchange", read);
      document.removeEventListener("scroll", clear, true);
      document.removeEventListener("keydown", onKey);
    };
  }, []);

  return state;
}
```

- [ ] **Step 4: 实现组件**

新建 `src/components/SelectionActions.tsx`（`useT` 的 import 路径照抄 `Thread.tsx` 头部的同名 import；复制成功反馈用按钮内联 `copied` 态，不接 toast，保持自包含）：

```tsx
import { useEffect, useState } from "react";
import type { Rect } from "../lib/selection-actions";
import { composeRewriteDraft, formatQuote, toolbarPlacement, TOOLBAR_H, TOOLBAR_W } from "../lib/selection-actions";
import { useT } from "../lib/locale-context";
import type { TextSelectionState } from "../hooks/useTextSelection";

interface SelectionActionsProps {
  state: TextSelectionState | null;
  viewport: { width: number; height: number };
  locale: "zh" | "en";
  onRewrite: (draft: string) => void;
  onQuote: (quote: string) => void;
}

export function SelectionActions({ state, viewport, locale, onRewrite, onQuote }: SelectionActionsProps) {
  const t = useT();
  const [copied, setCopied] = useState(false);

  useEffect(() => {
    if (!copied) return;
    const id = setTimeout(() => setCopied(false), 900);
    return () => clearTimeout(id);
  }, [copied]);

  if (!state) return null;
  const p = toolbarPlacement(state.rect, viewport, { width: TOOLBAR_W, height: TOOLBAR_H });

  async function copy() {
    try {
      await navigator.clipboard.writeText(state!.text);
      setCopied(true);
    } catch {
      setCopied(false);
    }
  }

  return (
    <div className="sel-toolbar" role="toolbar" style={{ transform: `translate(${p.x}px, ${p.y}px)` }}>
      <button type="button" onClick={() => onRewrite(composeRewriteDraft(formatQuote(state!.text), locale))}>
        {t("selection.rewrite")}
      </button>
      <button type="button" onClick={() => onQuote(formatQuote(state!.text))}>
        {t("selection.quote")}
      </button>
      <button type="button" onClick={() => void copy()}>
        {copied ? t("selection.copied") : t("selection.copy")}
      </button>
    </div>
  );
}
```

`useT()` 返回的函数签名若不是 `t(key)` 形态，以 `locale-context.tsx` 实际导出为准调整（Sidebar.tsx 中 `t("sidebar.batch")` 即此形态）。

- [ ] **Step 5: i18n 键**

`src/lib/i18n.ts` zh 块与 en 块各追加（放在各自块的 `palette.empty` 键附近）：

```ts
// zh
"selection.rewrite": "改写",
"selection.quote": "引用",
"selection.copy": "复制",
"selection.copied": "已复制",
// en
"selection.rewrite": "Rewrite",
"selection.quote": "Quote",
"selection.copy": "Copy",
"selection.copied": "Copied",
```

- [ ] **Step 6: App 挂载**

`src/App.tsx`：在主界面渲染树内（943 行 `.chat-shell` 所在的顶层容器末尾、与 toast/overlay 同级处）挂载一次：

```tsx
<SelectionActions
  state={selectionState}
  viewport={{ width: window.innerWidth, height: window.innerHeight }}
  locale={locale}
  onRewrite={(draft) => {
    setDraft(draft);
    requestAnimationFrame(() => {
      document.querySelector<HTMLTextAreaElement>(".composer textarea")?.focus();
    });
  }}
  onQuote={(quote) => {
    setDraft((prev) => (prev ? `${prev}\n${quote}` : quote));
    requestAnimationFrame(() => {
      document.querySelector<HTMLTextAreaElement>(".composer textarea")?.focus();
    });
  }}
/>
```

组件顶部加 `const selectionState = useTextSelection();`（import 自 `./hooks/useTextSelection`；`SelectionActions` import 自 `./components/SelectionActions`）。注意：`setDraft` 来自 `useAppModelState.ts:85`，确认 App 作用域内该名称可用（`useAppModel.ts:85` 已转发 `setDraft: s.setDraft`）；若 `setDraft` 是 React setState，`onQuote` 的函数式更新直接可用；若被包装为 `(v: string) => void`，则改为 `setDraft(currentDraft ? currentDraft + "\n" + quote : quote)`（`draft` 值同样来自 useAppModel 暴露）。

- [ ] **Step 7: 工具条样式**

`src/styles/thread.css` 末尾追加：

```css
/* ---- selection actions toolbar ---- */
.sel-toolbar {
  position: fixed;
  top: 0;
  left: 0;
  z-index: 60;
  display: flex;
  gap: 2px;
  padding: 3px;
  background: var(--bg-card);
  border: 1px solid var(--line);
  border-radius: 999px;
  box-shadow: var(--shadow-l);
  animation: sel-in var(--dur-fast) var(--ease);
}
.sel-toolbar button {
  border: 0;
  background: transparent;
  color: var(--muted);
  font-size: var(--ui-small);
  padding: 4px 12px;
  border-radius: 999px;
  transition: background-color var(--dur-fast) ease, color var(--dur-fast) ease;
}
.sel-toolbar button:hover { background: var(--bg-hover); color: var(--text); }
@keyframes sel-in {
  from { opacity: 0; }
  to { opacity: 1; }
}
```

- [ ] **Step 8: 运行测试确认通过**

Run: `npx vitest run src/components/SelectionActions.test.tsx src/lib/selection-actions.test.ts src/lib/i18n.test.ts && npm run typecheck`
Expected: PASS（i18n.test 若有键集合断言，新增键应满足；若失败按其现有模式补全）

- [ ] **Step 9: 提交**

```bash
git add src/hooks/useTextSelection.ts src/components/SelectionActions.tsx src/components/SelectionActions.test.tsx src/App.tsx src/styles/thread.css src/lib/i18n.ts
git commit -m "feat: selection actions toolbar for assistant messages (rewrite/quote/copy)"
```

---

### Task 12: E2E 视觉回归 + 划词全链路 + 全量验证

**Files:**
- Create: `e2e/frost-theme.spec.ts`
- Create: `e2e/selection.spec.ts`

**Interfaces:**
- Consumes: 全部前序任务产物；`playwright.config.ts` 现有约定（webServer 起 vite、`toHaveScreenshot` 基线在 `e2e/__screenshots__/`、`ignoreSnapshots: !process.env.CI`——本地跑截图断言需 `CI=1`）
- Produces: 4 组主题截图基线 + 划词 E2E

- [ ] **Step 1: 视觉回归 spec**

新建 `e2e/frost-theme.spec.ts`：

```ts
import { expect, test } from "@playwright/test";

const combos = [
  { family: "default", theme: "light" },
  { family: "default", theme: "dark" },
  { family: "frost", theme: "light" },
  { family: "frost", theme: "dark" },
] as const;

for (const { family, theme } of combos) {
  test(`shell renders ${family}/${theme}`, async ({ page }) => {
    await page.goto("/");
    await page.evaluate(
      ([f, t]) => {
        document.documentElement.dataset.themeFamily = f;
        document.documentElement.dataset.theme = t;
      },
      [family, theme],
    );
    await expect(page.locator("body")).toHaveScreenshot(`shell-${family}-${theme}.png`);
  });
}
```

Run（先建基线再验证）:
```bash
CI=1 npx playwright test e2e/frost-theme.spec.ts --update-snapshots
CI=1 npx playwright test e2e/frost-theme.spec.ts
```
Expected: 第二次运行 4 用例 PASS。人工查看 `e2e/__screenshots__/shell-frost-*.png` 对照 beautifului.dev 展示页核对基调（冷灰、描边、虚线）。

- [ ] **Step 2: 划词全链路 spec**

新建 `e2e/selection.spec.ts`。策略：向已有 `.chat`（或 `.chat-shell`）容器注入一条静态助手消息，再用 Selection API 划词——不依赖真实会话数据：

```ts
import { expect, test } from "@playwright/test";

test("selecting assistant text opens the toolbar and rewrite prefills the composer", async ({ page }) => {
  await page.goto("/");
  const host = page.locator(".chat-shell").first();
  await expect(host).toBeVisible();
  await host.evaluate((el) => {
    const msg = document.createElement("div");
    msg.className = "msg assistant";
    msg.textContent = "The quick brown fox jumps over the lazy dog.";
    el.appendChild(msg);
  });

  await host.locator(".msg.assistant").evaluate((el) => {
    const range = document.createRange();
    range.selectNodeContents(el);
    const sel = document.getSelection();
    sel!.removeAllRanges();
    sel!.addRange(range);
    document.dispatchEvent(new Event("selectionchange"));
  });

  const toolbar = page.locator('.sel-toolbar[role="toolbar"]');
  await expect(toolbar).toBeVisible();

  await toolbar.getByRole("button", { name: "改写" }).click();
  const composer = page.locator(".composer textarea").first();
  await expect(composer).toBeFocused();
  await expect(composer).toHaveValue(/The quick brown fox/);
  await expect(composer).toHaveValue(/改写上面这段/);
});
```

Run: `npx playwright test e2e/selection.spec.ts`
Expected: PASS。若 `改写` 按钮名因 locale 默认值不同而定位失败，改用 `toolbar.getByRole("button").first()`（顺序固定：改写/引用/复制）。

- [ ] **Step 3: 全量验证**

```bash
npm test && npm run typecheck && npm run build
CI=1 npx playwright test
```
Expected: vitest 全绿；tsc 无错误；vite build 成功；Playwright 全套（含既有 smoke）PASS。

- [ ] **Step 4: 提交**

```bash
git add e2e/frost-theme.spec.ts e2e/selection.spec.ts e2e/__screenshots__
git commit -m "test: frost theme visual regression and selection-actions e2e"
```

---

## 与 spec §5 的覆盖核对（自审记录）

本计划覆盖 spec §5 清单中全部**纯 CSS/最小 DOM 钩子可实现**的行。以下 4 项需要新增数据管道或 JS 功能（超出"样式移植"范畴），**有意延后为独立后续小项目**，不在本计划内：

| spec 行 | 延后原因 |
|---|---|
| Code Block 行号列 + copy 按钮 | 需改 `marked` 渲染管线（`src/lib/markdown.ts`）输出行号 DOM，属功能开发 |
| Insight Cards 图表 hover scrub | `TokenChart`/`UsageRing` 需新增交互数据层（scrub 位置→数值映射） |
| Recommendation Card 置信度 meter | 现有数据模型（`RecapCard`）无置信度字段，需先定义数据来源 |
| Loading State 已耗时读数 | `RunStatusRegion` 需新增计时状态与展示逻辑 |

等价性说明：DotMatrix 现有实现（`shell.css:489` 独立闪烁的像素格 + `styles.css:309` 的 reduce 降级）已满足 spec "Loading State 像素格 shimmer" 意图，不再重复改造。

## 收尾核对（执行完全部任务后）

- [ ] `npm run dev` 手工过一遍 spec §9 各 Phase 验收项：frost light/dark 切换、Sidebar glide、流式光标（发一条真实消息）、Skeleton shimmer、Work-run 进度条、划词→改写→Composer 预填
- [ ] 系统开启"减弱动态效果"后确认：shimmer/入场动画停止，spinner 与 work-run 进度条仍在动
- [ ] 对照 spec §7 确认无越界：未新增依赖、未动 default/paper/ink 的现有值、未复制站点产物
