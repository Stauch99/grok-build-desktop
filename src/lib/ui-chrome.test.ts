import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";
import { appCss, cssFile } from "./css-source";

const root = join(dirname(fileURLToPath(import.meta.url)), "../..");

function css(rel: string): string {
  return rel === "src/styles.css" ? appCss() : cssFile(rel);
}

describe("settings dialog chrome", () => {
  it("pins the settings window height and scrolls the pane", () => {
    const sheet = css("src/styles/settings.css");
    expect(sheet).toMatch(/\.settings-dialog\s*\{[^}]*\n\s*height:\s*min\(/);
    expect(sheet).toMatch(/\.settings-pane\s*\{[^}]*overflow:\s*auto/);
    expect(sheet).toMatch(/\.settings-layout\s*\{[^}]*align-items:\s*stretch/);
  });

  it("separates settings modules with hairlines, not filled cards", () => {
    const sheet = css("src/styles/settings.css");
    const card = sheet.match(/\.set-card\s*\{[^}]+\}/)?.[0];
    expect(card).toBeTruthy();
    expect(card).toMatch(/background:\s*transparent/);
    expect(card).toMatch(/border-radius:\s*0/);
    expect(card).toMatch(/border-bottom:\s*1px solid/);
  });
});

describe("yolo mode chip", () => {
  it("is a selected danger chip, not italic debug text", () => {
    const main = css("src/styles.css");
    const block = main.match(/\.mode-chip\.yolo\s*\{[^}]+\}/)?.[0];
    expect(block).toBeTruthy();
    expect(block).toMatch(/font-weight:\s*500/);
    expect(block).toMatch(/color-mix\(in srgb,\s*var\(--danger\)\s*10%,\s*transparent\)/);
    expect(block).toMatch(/color:\s*var\(--danger\)/);
    expect(block).not.toMatch(/italic/);
    expect(main).toMatch(/\.mode-chip\.yolo:hover\s*\{[^}]*background:/);
  });

  it("styles the yolo option in the mode menu the same way", () => {
    const sheet = css("src/styles/composer.css");
    const block = sheet.match(/\.mode-menu button\.yolo\s*\{[^}]+\}/)?.[0];
    expect(block).toBeTruthy();
    expect(block).toMatch(/font-weight:\s*500/);
    expect(block).toMatch(/color-mix\(in srgb,\s*var\(--danger\)\s*10%,\s*transparent\)/);
    expect(block).not.toMatch(/italic/);
  });
});

describe("usage chip tone", () => {
  it("keeps ok muted and paints warn/hot text so percent can be read", () => {
    const sheet = css("src/styles.css");
    expect(sheet).toMatch(/\.usage-chip-ok\s*\{[^}]*color:\s*var\(--faint\)/);
    expect(sheet).toMatch(/\.usage-chip-warn\s*\{[^}]*color:\s*var\(--warn\)/);
    expect(sheet).toMatch(/\.usage-chip-hot\s*\{[^}]*color:\s*var\(--danger\)/);
    expect(sheet).toMatch(/\.usage-chip-hot\s*\{[^}]*font-size:\s*var\(--ui-small\)/);
    expect(sheet).toMatch(/\.usage-chip-hot \.usage-bar-fill\s*\{[^}]*background:\s*var\(--danger\)/);
  });
});

describe("usage chart plot", () => {
  it("gives bars room and highlights today", () => {
    const sheet = css("src/styles.css");
    expect(sheet).toMatch(/\.usage-chart-plot\s*\{[^}]*height:\s*128px/);
    expect(sheet).toMatch(/\.usage-chart-col\s*\{[^}]*height:\s*128px/);
    expect(sheet).toMatch(/\.usage-chart-col-today \.usage-chart-bar\s*\{[^}]*background:\s*var\(--text\)/);
  });
});

describe("composer dock stack", () => {
  it("keeps live run chrome in the thread, not duplicated above the composer", () => {
    const app = readFileSync(join(root, "src/App.tsx"), "utf8");
    expect(app.match(/<WaitPill/g)).toBeNull();
    expect(app).toMatch(/goalView && !mainPaneBusy/);
    const thread = readFileSync(join(root, "src/components/Thread.tsx"), "utf8");
    expect(thread).toMatch(/onStop=\{runBusy \? onCancel/);
  });

  it("stacks capsules in a column above the input", () => {
    const sheet = css("src/styles.css");
    expect(sheet).toMatch(/\.composer-dock\s*\{[^}]*flex-direction:\s*column/);
    expect(sheet).toMatch(/\.dock-capsule-pill\s*\{[^}]*border-radius:\s*999px/);
    expect(sheet).toMatch(/\.dock-capsule-card\s*\{[^}]*border-radius:\s*12px/);
  });

  it("keeps subagents in the header catalog, not the composer dock", () => {
    const app = readFileSync(join(root, "src/App.tsx"), "utf8");
    expect(app).not.toMatch(/SubagentChipRow|SubagentCard/);
    expect(app).not.toMatch(/mcpInheritance/);
    const header = app.slice(app.indexOf("subagent.count"), app.indexOf("subagent.count") + 900);
    expect(header).toMatch(/openSession/);
    const model = readFileSync(join(root, "src/hooks/useAppModel.ts"), "utf8");
    expect(model).toMatch(/subagentChips\(/);
    const sheet = css("src/styles.css");
    expect(sheet).not.toMatch(/\.subagent-shell\s*\{/);
  });
});

describe("usage mix dashboard", () => {
  it("leads with a compact hero and a stacked token mix", () => {
    const sheet = css("src/styles.css");
    expect(sheet).toMatch(/\.usage-hero-tokens strong\s*\{[^}]*font-size:\s*28px/);
    expect(sheet).toMatch(/\.usage-mix-head strong\s*\{[^}]*color:\s*var\(--ok\)/);
    expect(sheet).toMatch(/\.usage-mix-track\s*\{[^}]*height:\s*8px/);
    expect(sheet).toMatch(/\.usage-facts\s*\{[^}]*grid-template-columns:\s*repeat\(3/);
    expect(sheet).toMatch(/\.usage-mix-cache\s*\{[^}]*background:\s*var\(--ok\)/);
  });
});

describe("settings scrim", () => {
  it("dims the thread without going full black", () => {
    const sheet = css("src/styles/settings.css");
    const block = sheet.match(/\.settings-backdrop\s*\{[^}]+\}/)?.[0];
    expect(block).toBeTruthy();
    expect(block).toMatch(/rgba\(0,\s*0,\s*0,\s*0\.4[0-5]\)/);
  });
});

describe("workspace header title hierarchy", () => {
  it("demotes the cwd crumb and keeps the session title primary", () => {
    const sheet = css("src/styles.css");
    const crumb = sheet.match(/\.crumb-cwd\s*\{[^}]+\}/)?.[0];
    expect(crumb).toBeTruthy();
    expect(crumb).toMatch(/color:\s*var\(--faint\)/);
    expect(crumb).toMatch(/font-size:\s*var\(--ui-smaller\)/);
    expect(crumb).toMatch(/font-weight:\s*400/);

    const sep = sheet.match(/\.crumb-sep\s*\{[^}]+\}/)?.[0];
    expect(sep).toBeTruthy();
    expect(sep).toMatch(/color:\s*var\(--faint\)/);
    expect(sep).toMatch(/font-size:\s*var\(--ui-smaller\)/);

    const menuCrumb = sheet.match(/\.menu-select\.crumb-cwd\s*\{[^}]+\}/)?.[0];
    expect(menuCrumb).toBeTruthy();
    expect(menuCrumb).toMatch(/color:\s*var\(--faint\)/);

    const crumbBtn = sheet.match(/\.menu-select\.crumb-cwd\s+\.menu-select-btn\s*\{[^}]+\}/)?.[0];
    expect(crumbBtn).toBeTruthy();
    expect(crumbBtn).toMatch(/color:\s*var\(--faint\)/);
    expect(crumbBtn).toMatch(/font-size:\s*var\(--ui-smaller\)/);
    expect(crumbBtn).toMatch(/font-weight:\s*400/);

    const title = sheet.match(/\.session-title-btn[^{]*\{[^}]+\}/)?.[0];
    expect(title).toBeTruthy();
    expect(title).toMatch(/color:\s*var\(--text\)/);
    expect(title).toMatch(/font-weight:\s*([56]00)/);
  });
});

describe("header subagent menu", () => {
  it("opens downward from the header and scrolls long catalogs", () => {
    const sheet = css("src/styles.css");
    const block = sheet.match(/\.head-actions \.chip-menu\s*\{[^}]+\}/)?.[0];
    expect(block).toBeTruthy();
    expect(block).toMatch(/top:\s*calc\(100% \+ 4px\)/);
    expect(block).toMatch(/bottom:\s*auto/);
    expect(block).toMatch(/overflow-y:\s*auto/);
    expect(block).toMatch(/max-height:/);
  });
});

describe("review rail dock", () => {
  it("sits in a full-height stage to the right of every pane layout", () => {
    const sheet = css("src/styles.css");
    const stage = sheet.match(/\.workspace-stage\s*\{[^}]*display:\s*flex[^}]*\}/)?.[0];
    expect(stage).toBeTruthy();
    expect(sheet).toMatch(/\.workspace-stage\s*\{[^}]*height:\s*100%/);
    expect(sheet).toMatch(/\.workspace-stage \.workspace\s*\{[^}]*flex:\s*1/);
    const review = css("src/styles/review.css");
    expect(review).toMatch(/\.workspace-stage > \.resizer:has\(\+ \.review-rail\)/);
    const panes = review.match(/\.review-panes\s*\{[^}]+\}/)?.[0];
    expect(panes).toMatch(/flex-wrap:\s*nowrap/);
    expect(review).toMatch(/\.review-panes button\s*\{[^}]*min-width:\s*44px/);
    expect(review).toMatch(/\.review-panes button\s*\{[^}]*flex:\s*1 1 auto/);
  });

  it("swaps peer labels for icons, then drops the git count", () => {
    const review = css("src/styles/review.css");
    expect(review).toMatch(/\.review-head\s*\{[^}]*container-type:\s*inline-size/);
    expect(review).toMatch(/@container[^{]*max-width:\s*380px[\s\S]{0,500}\.review-pane-label[\s\S]{0,80}display:\s*none/);
    expect(review).toMatch(/@container[^{]*max-width:\s*380px[\s\S]{0,500}\.review-pane-icon[\s\S]{0,80}display:\s*(block|flex|grid)/);
    expect(review).toMatch(/@container[^{]*max-width:\s*320px[\s\S]{0,400}\.tab-count[\s\S]{0,80}display:\s*none/);

    const src = readFileSync(join(root, "src/components/ReviewRail.tsx"), "utf8");
    expect(src).toMatch(/className="review-pane-icon"/);
    expect(src).toMatch(/aria-label=\{label\}/);
    expect(src).toContain("IconChart");
    expect(src).toContain("IconBranch");
    expect(src).toContain("IconEye");
    expect(src).toContain("IconFolder");
  });
});

describe("composer prompt", () => {
  it("keeps the textarea to one quiet line and parks mode chips outside the box", () => {
    const sheet = css("src/styles/composer.css");
    const ta = sheet.match(/\.composer textarea\s*\{[^}]+\}/)?.[0];
    expect(ta).toMatch(/font-size:\s*var\(--md-size/);
    expect(ta).toMatch(/line-height:\s*1\.5/);
    expect(ta).toMatch(/color:\s*var\(--text\)/);
    expect(sheet).toMatch(/\.composer textarea::placeholder\s*\{[^}]*color:\s*var\(--muted\)/);
    expect(ta).not.toMatch(/min-height:\s*42px/);
    expect(sheet).toMatch(/\.send-btn\s*\{[^}]*width:\s*24px/);
    expect(sheet).toMatch(/\.send-btn\s*\{[^}]*height:\s*24px/);

    const chips = sheet.match(/\.composer-chips\s*\{[^}]+\}/)?.[0];
    expect(chips).toMatch(/margin:\s*0/);
    expect(chips).toMatch(/width:\s*auto/);
    expect(chips).toMatch(/flex:\s*0 0 auto/);
    expect(sheet).not.toMatch(/\.composer-wrap \.composer-chips,/);

    const main = css("src/styles.css");
    const chip = main.match(/\.model-chip, \.mode-chip, \.effort-chip, \.agent-chip\s*\{[^}]+\}/)?.[0];
    expect(chip).toMatch(/font-size:\s*var\(--md-size/);
    expect(chip).toMatch(/color:\s*var\(--faint\)/);
    expect(sheet).toMatch(/\.composer-meta-row\s*\{[^}]*font-size:\s*calc\(var\(--md-size(?:,\s*15px)?\)\s*-\s*2px\)/);
    expect(sheet).toMatch(/\.composer-meta-row \.cwd-chip[\s\S]{0,280}font-size:\s*inherit/);
    expect(sheet).toMatch(/\.composer-meta\s*\{[^}]*font-size:\s*inherit/);
    expect(css("src/styles/shell.css")).toMatch(/\.cwd-chip\s*\{[^}]*font-size:\s*var\(--md-size/);
    expect(css("src/styles/hub.css")).toMatch(/\.dock-capsule\s*\{[^}]*font-size:\s*var\(--md-size/);
    expect(css("src/styles/shell.css")).toMatch(/\.wait-pill\s*\{[^}]*font-size:\s*var\(--md-size/);

    const src = readFileSync(join(root, "src/components/Composer.tsx"), "utf8");
    expect(src).not.toMatch(/composer\.placeholder/);
    expect(src).not.toMatch(/placeholder=\{/);
    const box = src.slice(src.indexOf("<div className=\"composer\">"), src.indexOf("composer-meta-row"));
    expect(box).not.toContain("ComposerChips");
    expect(src).toMatch(/composer-meta-row[\s\S]*ComposerChips/);

    const meta = src.slice(src.indexOf("composer-meta-row"));
    const left = meta.slice(meta.indexOf("composer-meta-left"), meta.indexOf("composer-meta-right"));
    expect(left).toMatch(/cwd-chip[\s\S]*\{footer\}/);
    expect(left).not.toMatch(/ComposerChips|metaActions/);
    const right = meta.slice(meta.indexOf("composer-meta-right"));
    expect(right.indexOf("ComposerChips")).toBeGreaterThan(-1);
    expect(right.indexOf("ComposerChips")).toBeLessThan(right.indexOf("{metaActions}"));
  });

  it("uses one agent capsule, not four CLI buttons", () => {
    const src = readFileSync(join(root, "src/components/AgentChip.tsx"), "utf8");
    expect(src).toMatch(/chip-wrap/);
    expect(src).toMatch(/chip-menu agent-menu/);
    expect(src).not.toMatch(/agent-chip-row/);
    expect(src).not.toMatch(/aria-pressed/);
    const sheet = css("src/styles/composer.css");
    expect(sheet).not.toMatch(/\.agent-chip-row/);
  });

  it("pills the project, model, and effort chips", () => {
    const main = css("src/styles.css");
    const pill = main.match(/\.cwd-chip,\s*\.model-chip,\s*\.effort-chip,\s*\.agent-chip\s*\{[^}]+\}/)?.[0];
    expect(pill).toMatch(/border-radius:\s*999px/);
    const shared = main.match(/\.model-chip, \.mode-chip, \.effort-chip, \.agent-chip\s*\{[^}]+\}/)?.[0];
    expect(shared).not.toMatch(/border-radius:\s*999px/);
  });

  it("sizes chip menus to the same body size as the trigger chips", () => {
    const sheet = css("src/styles/composer.css");
    const item = sheet.match(/\.chip-menu button\s*\{[^}]+\}/)?.[0];
    expect(item).toMatch(/font-size:\s*var\(--md-size/);
    const hint = sheet.match(/\.chip-menu \.hint\s*\{[^}]+\}/)?.[0];
    expect(hint).toMatch(/font-size:\s*var\(--md-size/);
    expect(sheet).toMatch(/\.chip-menu \.menu-hint-label\s*\{[^}]*font-size:\s*var\(--md-size/);
    expect(sheet).toMatch(/\.chip-menu \.menu-hint-text\s*\{[^}]*font-size:\s*var\(--md-size/);
  });

  it("omits project, stats, then the context ring when the row overflows", () => {
    const sheet = css("src/styles/composer.css");
    expect(sheet).toMatch(/\[data-hide-cwd\][\s\S]{0,120}\.composer-meta-cwd/);
    expect(sheet).toMatch(/\[data-hide-stats\][\s\S]{0,120}\.composer-meta-stats/);
    expect(sheet).toMatch(/\[data-hide-ring\][\s\S]{0,120}\.usage-chip/);
    expect(sheet).toMatch(/\.composer-meta-left\s*\{[^}]*justify-content:\s*flex-start/);
    expect(sheet).toMatch(/\.composer-meta-right\s*\{[^}]*justify-content:\s*flex-end/);
    expect(sheet).toMatch(/\.composer-meta-right\s*\{[^}]*margin-left:\s*auto/);
  });
});

describe("composer context ring", () => {
  it("draws a ring with no percent label and reveals copy on hover", () => {
    const src = readFileSync(join(root, "src/components/UsageRing.tsx"), "utf8");
    expect(src).toMatch(/className="usage-ring"/);
    expect(src).not.toMatch(/usage-bar/);
    expect(src).not.toMatch(/\{p\.used\}%/);

    const sheet = css("src/styles.css");
    expect(sheet).toMatch(/\.usage-ring-fill\s*\{[^}]*stroke:\s*currentColor/);
    expect(sheet).toMatch(/\.usage-chip:hover \.usage-pop/);
  });
});

describe("split pane focus", () => {
  it("dims idle panes with a wash instead of an accent outline", () => {
    const sheet = css("src/styles.css");
    const tokens = css("src/styles/tokens.css");
    expect(tokens).toMatch(/--bg: hsl\(30 14\.3% 97\.3%\);[\s\S]*?--pane-dim:\s*hsl\(0 0% 100% \//);
    expect(tokens).toMatch(/\[data-theme="dark"\][\s\S]*?--pane-dim:\s*hsl\(0 0% 0% \/ 28%\)/);
    expect(sheet).toMatch(/\.workspace\.split \.pane:not\(\.is-focused\)::after\s*\{[^}]*background:\s*var\(--pane-dim\)/);
    expect(sheet).not.toMatch(/\.workspace\.split \.pane\.is-focused\s*\{[^}]*outline-color/);
  });
});

describe("session list presence tones", () => {
  it("uses two background tokens and drops the split-open outline", () => {
    const sheet = css("src/styles/sidebar.css");
    const open = sheet.match(/\.session\.open\s*\{[^}]+\}/)?.[0];
    const active = sheet.match(/\.session\.active\s*\{[^}]+\}/)?.[0];
    expect(open).toMatch(/background:\s*var\(--bg-hover\)/);
    expect(active).toMatch(/background:\s*var\(--bg-active\)/);
    expect(sheet).not.toMatch(/\.session\.split-open/);
  });
});

describe("session list subagent chrome", () => {
  it("hangs the descendant count in the tree indent with a gray fill", () => {
    const sheet = css("src/styles/sidebar.css");
    const count = sheet.match(/\.sess-kid-count\s*\{[^}]+\}/)?.[0];
    expect(count).toMatch(/position:\s*absolute/);
    expect(count).toMatch(/left:\s*-/);
    expect(count).toMatch(/border-radius:\s*50%/);
    expect(count).toMatch(/background:\s*color-mix/);
    expect(count).not.toMatch(/background:\s*transparent/);
    expect(sheet).not.toMatch(/\.sess-gutter\s*\{/);
    expect(sheet).not.toMatch(/\.session \.count\s*\{/);
  });

  it("renders CLI identity as a square icon, not a colored text pill", () => {
    const sheet = css("src/styles/sidebar.css");
    const agent = sheet.match(/\.sess-agent\s*\{[^}]+\}/)?.[0];
    expect(agent).toMatch(/width:\s*16px/);
    expect(agent).not.toMatch(/padding:\s*1px 5px/);
    expect(sheet).not.toMatch(/\.sess-agent-claude\s*\{[^}]*background:/);
    expect(sheet).not.toMatch(/\.sess-agent-grok\s*\{[^}]*background:/);
  });
});

describe("tauri window drag capability", () => {
  it("allows startDragging for overlay titlebar regions", () => {
    const caps = readFileSync(join(root, "src-tauri/capabilities/default.json"), "utf8");
    expect(caps).toMatch(/core:window:allow-start-dragging/);
  });
});

describe("sidebar window drag", () => {
  it("uses an empty traffic strip so titlebar drag is not eaten by header buttons", () => {
    const src = readFileSync(join(root, "src/components/Sidebar.tsx"), "utf8");
    expect(src).toMatch(/className="side-traffic-drag"[^>]*data-tauri-drag-region/);
    expect(src).toMatch(/className="side-traffic-drag"[\s\S]{0,200}beginWindowDrag/);
    expect(src).not.toMatch(/className="side-traffic"[^>]*data-tauri-drag-region/);

    const sheet = css("src/styles/sidebar.css");
    const drag = sheet.match(/\.side-traffic-drag\s*\{[^}]+\}/)?.[0];
    expect(drag).toMatch(/flex:\s*1/);
    expect(drag).toMatch(/min-width:\s*48px/);
    expect(sheet).toMatch(/\.side-actions\s*\{[^}]*-webkit-app-region:\s*no-drag/);
  });
});

describe("workspace header window drag", () => {
  it("keeps an empty drag strip out of the button row", () => {
    const src = readFileSync(join(root, "src/App.tsx"), "utf8");
    expect(src).toMatch(/className="workspace-head-drag"[^>]*data-tauri-drag-region/);
    expect(src).toMatch(/className="workspace-head-drag"[\s\S]{0,240}beginWindowDrag/);
    expect(src).not.toMatch(/className="workspace-head"[^>]*data-tauri-drag-region/);

    const sheet = css("src/styles/shell.css");
    const drag = sheet.match(/\.workspace-head-drag\s*\{[^}]+\}/)?.[0];
    expect(drag).toMatch(/flex:\s*1/);
    expect(drag).toMatch(/min-width:\s*48px/);
    expect(sheet).toMatch(/\.head-actions\s*\{[^}]*-webkit-app-region:\s*no-drag/);
  });
});

describe("session row pane drag", () => {
  it("does not capture the pointer on mousedown so a click can open the session", () => {
    const src = readFileSync(join(root, "src/hooks/pane-tree-actions.ts"), "utf8");
    const fn = src.slice(src.indexOf("export function beginPaneDrag"), src.indexOf("export function onExtraDraftChange") >= 0 ? src.indexOf("export function onExtraDraftChange") : src.length);
    expect(fn).toMatch(/window\.addEventListener\("pointermove"/);
    expect(fn.indexOf("setPointerCapture")).toBe(-1);
    expect(fn).toMatch(/dragStarted/);
  });
});

describe("git pane actions", () => {
  it("wires checkout and worktree switch from the rail", () => {
    const src = readFileSync(join(root, "src/App.tsx"), "utf8");
    expect(src).toMatch(/worktrees=\{gitWorktrees\}/);
    expect(src).toMatch(/onCheckout=\{checkoutBranch\}/);
    expect(src).toMatch(/onSwitchWorktree=\{\(path\) => void switchWorktree\(path\)\}/);
  });

  it("opens git action menus downward so they stay inside the pane", () => {
    const sheet = css("src/styles/review.css");
    const block = sheet.match(/\.git-pane \.chip-menu\.git-action-menu\s*\{[^}]+\}/)?.[0];
    expect(block).toMatch(/top:\s*calc\(100% \+ 4px\)/);
    expect(block).toMatch(/bottom:\s*auto/);
  });
});

describe("chrome selection and focus", () => {
  it("locks selection on the shell and restores it on conversation text", () => {
    const main = css("src/styles.css");
    const thread = css("src/styles/thread.css");
    expect(main).toMatch(/\.app\s*\{[^}]*user-select:\s*none/);
    expect(thread).toMatch(/\.thread \.msg[\s\S]{0,500}user-select:\s*text/);
  });

  it("does not draw the accent ring on text fields", () => {
    const sheet = css("src/styles.css");
    expect(sheet).toMatch(/\.palette-input:focus-visible\s*\{[^}]*outline:\s*none/);
    expect(sheet).not.toMatch(/:focus-visible\s*\{[^}]*outline:\s*1px solid var\(--accent\)/);
  });
});

describe("thread body size", () => {
  it("scales work-timeline verbs with the markdown body size", () => {
    const sheet = css("src/styles/thread.css");
    const verb = sheet.match(/\.spine-verb\s*\{[^}]+\}/)?.[0];
    const detail = sheet.match(/\.spine-detail\s*\{[^}]+\}/)?.[0];
    const thought = sheet.match(/\.spine-body \.thought\s*\{[^}]+\}/)?.[0];
    const run = sheet.match(/(?:^|\n)\.work-run-text\s*\{[^}]+\}/)?.[0];
    expect(verb).toMatch(/font-size:\s*var\(--md-size/);
    expect(detail).toMatch(/font-size:\s*var\(--md-size/);
    expect(thought).toMatch(/font-size:\s*var\(--md-size/);
    expect(run).toMatch(/font-size:\s*var\(--md-size/);
    expect(sheet).toMatch(/\.work-run\.live \.work-run-text\s*\{[^}]*color:\s*var\(--text\)/);
  });

  it("keeps inline code the same size as the surrounding paragraph", () => {
    const sheet = css("src/styles/thread.css");
    const inline = sheet.match(/(?:^|\n)\.md code\s*\{[^}]+\}/)?.[0];
    expect(inline).toMatch(/font-size:\s*1em/);
    expect(css("src/styles/settings.css")).toMatch(
      /(?:^|\n)\.settings code\s*\{[^}]*font-size:\s*0\.92em/,
    );
  });

  it("renders thread markdown in system UI with 10% taller leading and Noto Serif headings", () => {
    const sheet = css("src/styles/thread.css");
    const body = [...sheet.matchAll(/(?:^|\n)\.thread \.md\s*\{[^}]+\}/g)].at(-1)?.[0];
    expect(body).toMatch(/font-family:\s*system-ui/);
    expect(body).toMatch(/line-height:\s*1\.65/);
    const heads = sheet.match(/\.thread \.md h1,\s*\.thread \.md h2[\s\S]*?\}/)?.[0] ?? "";
    expect(heads).toMatch(/Noto Serif SC/);
    expect(heads).toMatch(/Noto Serif/);
    expect(heads).toMatch(/line-height:\s*1\.485/);
    const main = readFileSync(join(root, "src/main.tsx"), "utf8");
    expect(main).toMatch(/@fontsource\/noto-serif\//);
    expect(main).toMatch(/@fontsource\/noto-serif-sc\//);
    expect(css("src/styles/tokens.css")).toMatch(/--serif:\s*"Noto Serif SC"/);
  });
});

describe("thread end reading pad", () => {
  it("leaves extra scroll space under the last turn so reading sits above the composer", () => {
    const sheet = css("src/styles/thread.css");
    expect(sheet).toMatch(/--thread-end-pad:\s*min\(/);
    expect(sheet).toMatch(/\.thread::after\s*\{[^}]*height:\s*var\(--thread-end-pad\)/);
    expect(sheet).toMatch(/\.thread-list\s*\{[^}]*padding-bottom:\s*var\(--thread-end-pad\)/);
    expect(sheet).toMatch(/\.new-chat-hero \.thread::after\s*\{[^}]*display:\s*none/);
  });

  it("fades the last 30px of the thread into the workspace", () => {
    const sheet = css("src/styles/thread.css");
    const fade = sheet.match(/\.chat-shell::after\s*\{[^}]+\}/)?.[0];
    expect(fade).toMatch(/height:\s*30px/);
    expect(fade).toMatch(/linear-gradient\(to bottom,\s*transparent,\s*var\(--bg\)\)/);
    expect(fade).toMatch(/pointer-events:\s*none/);
    expect(sheet).toMatch(/\.new-chat-hero \.chat-shell::after\s*\{[^}]*content:\s*none/);
  });
});

describe("assistant copy control", () => {
  it("sits to the right of the text, always visible, bottom-aligned", () => {
    const sheet = css("src/styles/thread.css");
    const msg = sheet.match(/(?:^|\n)\.msg\.assistant\s*\{[^}]+\}/)?.[0];
    expect(msg).toMatch(/display:\s*flex/);
    expect(msg).toMatch(/align-items:\s*flex-end/);
    expect(sheet).not.toMatch(/\.msg\.assistant \.actions\s*\{[^}]*display:\s*none/);
    expect(sheet).not.toMatch(/\.msg\.assistant:hover \.actions/);
  });
});

describe("work-run expand layout", () => {
  it("keeps the header on the same 22px spine column as the timeline", () => {
    const sheet = css("src/styles/thread.css");
    const head = sheet.match(/(?:^|\n)\.work-run-head\s*\{[^}]+\}/)?.[0];
    const ico = sheet.match(/(?:^|\n)\.work-run-ico\s*\{[^}]+\}/)?.[0];
    expect(head).toMatch(/grid-template-columns:\s*22px/);
    expect(ico).toMatch(/width:\s*22px/);
  });

  it("does not scale the header on press", () => {
    const sheet = css("src/styles/thread.css");
    expect(sheet).toMatch(/\.work-run-head:active[\s\S]{0,80}transform:\s*none/);
  });
});

describe("user turn actions", () => {
  it("reserves the action row height while hiding it until hover", () => {
    const sheet = css("src/styles/thread.css");
    const row = sheet.match(/(?:^|\n)\.msg-actions\s*\{[^}]+\}/)?.[0];
    expect(row).toMatch(/display:\s*flex/);
    expect(row).toMatch(/visibility:\s*hidden/);
    expect(row).not.toMatch(/display:\s*none/);
    expect(sheet).toMatch(/\.msg\.user:hover \.msg-actions[\s\S]{0,160}visibility:\s*visible/);
  });
});

describe("round-3 remaining wiring", () => {
  it("lets the session tree keyboard target title rows, not a missing button.session", () => {
    const sidebar = readFileSync(join(root, "src/components/Sidebar.tsx"), "utf8");
    expect(sidebar).toMatch(/data-session-row/);
    expect(sidebar).toMatch(/sessionTreeNav\(/);
    const branch = readFileSync(join(root, "src/components/SessionBranch.tsx"), "utf8");
    expect(branch).toMatch(/data-session-row=\{s\.id\}/);
  });

  it("keeps the review rail mounted through its exit animation", () => {
    const app = readFileSync(join(root, "src/App.tsx"), "utf8");
    expect(app).toMatch(/usePresence\(/);
    expect(app).toMatch(/leaving=\{reviewPresence\.leaving\}/);
  });

  it("pauses toasts while hovered or focused", () => {
    const toast = readFileSync(join(root, "src/hooks/useToast.ts"), "utf8");
    expect(toast).toMatch(/pauseToast/);
    expect(toast).toMatch(/resumeToast/);
    const app = readFileSync(join(root, "src/App.tsx"), "utf8");
    expect(app).toMatch(/onMouseEnter=\{pauseToast\}/);
  });
});
