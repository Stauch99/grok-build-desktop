import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";

const root = join(dirname(fileURLToPath(import.meta.url)), "../..");

function css(rel: string): string {
  return readFileSync(join(root, rel), "utf8");
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
  it("stacks capsules in a column above the input", () => {
    const sheet = css("src/styles.css");
    expect(sheet).toMatch(/\.composer-dock\s*\{[^}]*flex-direction:\s*column/);
    expect(sheet).toMatch(/\.dock-capsule-pill\s*\{[^}]*border-radius:\s*999px/);
    expect(sheet).toMatch(/\.dock-capsule-card\s*\{[^}]*border-radius:\s*12px/);
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
    expect(ta).toMatch(/font-size:\s*13px/);
    expect(ta).toMatch(/line-height:\s*18px/);
    expect(ta).toMatch(/min-height:\s*24px/);
    expect(ta).toMatch(/padding:\s*3px 0/);
    expect(ta).toMatch(/color:\s*var\(--muted\)/);
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
    expect(chip).toMatch(/font-size:\s*12px/);
    expect(chip).toMatch(/color:\s*var\(--faint\)/);

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

  it("sizes chip menus to the same 12px as the trigger chips", () => {
    const sheet = css("src/styles/composer.css");
    const item = sheet.match(/\.chip-menu button\s*\{[^}]+\}/)?.[0];
    expect(item).toMatch(/font-size:\s*12px/);
    const hint = sheet.match(/\.chip-menu \.hint\s*\{[^}]+\}/)?.[0];
    expect(hint).toMatch(/font-size:\s*11px/);
    expect(sheet).toMatch(/\.chip-menu \.menu-hint-label\s*\{[^}]*font-size:\s*12px/);
    expect(sheet).toMatch(/\.chip-menu \.menu-hint-text\s*\{[^}]*font-size:\s*11px/);
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

describe("sidebar window drag", () => {
  it("makes the traffic strip a drag region except the header buttons", () => {
    const src = readFileSync(join(root, "src/components/Sidebar.tsx"), "utf8");
    expect(src).toMatch(/className="side-traffic"[^>]*data-tauri-drag-region/);
    expect(src).toMatch(/className="side-traffic-drag"[^>]*data-tauri-drag-region/);
    expect(src).toMatch(/beginWindowDrag/);

    const sheet = css("src/styles/sidebar.css");
    expect(sheet).toMatch(/\.side-traffic\s*\{[^}]*padding:\s*0 8px 0 80px/);
    expect(sheet).toMatch(/\.side-traffic-drag\s*\{[^}]*flex:\s*1/);
    expect(sheet).toMatch(/\.side-traffic-drag\s*\{[^}]*min-height:\s*100%/);
    expect(sheet).toMatch(/\.side-actions\s*\{[^}]*-webkit-app-region:\s*no-drag/);
  });
});

describe("session row pane drag", () => {
  it("does not capture the pointer on mousedown so a click can open the session", () => {
    const src = readFileSync(join(root, "src/hooks/useAppModel.ts"), "utf8");
    const fn = src.slice(src.indexOf("function beginPaneDrag"), src.indexOf("function onExtraDraftChange"));
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
    expect(verb).toMatch(/font-size:\s*var\(--md-size/);
    expect(detail).toMatch(/font-size:\s*var\(--md-size/);
    expect(thought).toMatch(/font-size:\s*var\(--md-size/);
  });
});
