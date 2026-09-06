import { describe, expect, it } from "vitest";
import { cssFile } from "./css-source";

function css(rel: string): string {
  return cssFile(rel);
}

describe("keyboard focus", () => {
  it("keeps a visible :focus-visible outline on form controls", () => {
    const src = css("src/styles/workspace.css");
    const block = src.match(/\/\* ---- keyboard focus ---- \*\/[\s\S]*?(?=\n\/\* ----|$)/)?.[0] ?? "";
    expect(block).toMatch(/:focus-visible\s*\{[^}]*outline:\s*1px solid/);
    expect(block).not.toMatch(/textarea:focus-visible[^}]*outline:\s*none/);
  });

  it("does not draw an inner focus ring inside the composer pill", () => {
    const workspace = css("src/styles/workspace.css");
    const composer = css("src/styles/composer.css");
    const block = workspace.match(/\/\* ---- keyboard focus ---- \*\/[\s\S]*?(?=\n\/\* ----|$)/)?.[0] ?? "";
    expect(block).not.toMatch(/\.composer textarea:focus-visible/);
    expect(composer).toMatch(/\.composer textarea\s*\{[^}]*outline:\s*none/);
    expect(composer).toMatch(/\.composer:focus-within\s*\{[^}]*border-color:/);
  });
});

describe("settings dialog height", () => {
  it("does not force hub and extra overlays to the settings 82vh height", () => {
    const src = css("src/styles/settings.css");
    const dialog = src.match(/^\.settings-dialog\s*\{[^}]+\}/m)?.[0] ?? "";
    expect(dialog).not.toMatch(/height:\s*min\(82vh/);
    expect(src).toMatch(/\.settings-layer\s*>\s*\.settings-dialog\s*\{[^}]*height:\s*min\(82vh/);
  });
});

describe("compact density", () => {
  it("keeps persisted compact type and spacing overrides", () => {
    expect(css("src/styles/tokens.css")).toMatch(/:root\[data-density="compact"\]\s*\{[^}]*--ui-small:\s*12px/);
    expect(css("src/styles/composer.css")).toMatch(/:root\[data-density="compact"\]\s+\.composer\s*\{[^}]*padding:/);
    expect(css("src/styles/thread.css")).toMatch(/:root\[data-density="compact"\]\s+\.msg\s*\{/);
  });
});

describe("reduced motion", () => {
  it("does not freeze the spinner and does not fade memory-dock to invisible", () => {
    const src = css("src/styles.css");
    const reduceIdx = src.indexOf("@media (prefers-reduced-motion: reduce)");
    expect(reduceIdx).toBeGreaterThan(0);
    const chunk = src.slice(reduceIdx, reduceIdx + 1600);
    expect(chunk).toMatch(/\.memory-dock[\s\S]*animation:\s*none/);
    expect(chunk).toMatch(/\.spinner[\s\S]*infinite/);
    expect(chunk).toMatch(/spinner-pulse/);
    expect(chunk).toMatch(/\.work-run\.live \.work-run-text[\s\S]*animation:\s*none/);
  });
});

describe("motion tokens and press feedback", () => {
  it("exposes ease-in, ease-in-out, and a slow duration", () => {
    const tokens = css("src/styles/tokens.css");
    expect(tokens).toMatch(/--ease-in:/);
    expect(tokens).toMatch(/--ease-in-out:/);
    expect(tokens).toMatch(/--dur-slow:/);
  });

  it("gives buttons a press scale", () => {
    expect(css("src/styles.css")).toMatch(/button:active[\s\S]*scale\(0\.97\)/);
  });

  it("centers jump-bottom without transform so a press scale cannot shove it sideways", () => {
    const block = css("src/styles/shell.css").match(/\.jump-bottom\s*\{[^}]+\}/)?.[0] ?? "";
    expect(block).toMatch(/left:\s*0/);
    expect(block).toMatch(/right:\s*0/);
    expect(block).toMatch(/margin-inline:\s*auto/);
    expect(block).not.toMatch(/translateX\(-50%\)/);
  });

  it("animates permission cards in", () => {
    expect(css("src/styles/overlays.css")).toMatch(/\.permission\s*\{[\s\S]*rise-in/);
  });

  it("clamps permission and question titles to two lines with ellipsis, not a scroll box", () => {
    const sheet = css("src/styles/overlays.css");
    const cmd = sheet.match(/\.permission-cmd\s*\{[^}]+\}/)?.[0] ?? "";
    const heading = sheet.match(/\.permission h4\s*\{[^}]+\}/)?.[0] ?? "";
    expect(cmd).toMatch(/-webkit-line-clamp:\s*2/);
    expect(cmd).toMatch(/overflow:\s*hidden/);
    expect(cmd).not.toMatch(/overflow:\s*auto/);
    expect(cmd).not.toMatch(/max-height:/);
    expect(heading).toMatch(/-webkit-line-clamp:\s*2/);
    expect(heading).toMatch(/overflow:\s*hidden/);
  });

  it("does not animate sidebar grid-template-columns", () => {
    const app = css("src/styles.css").match(/^\.app\s*\{[^}]+\}/m)?.[0] ?? "";
    expect(app).not.toMatch(/transition:\s*grid-template-columns/);
  });

  it("does not transition sidebar 0fr/1fr row templates", () => {
    const sheet = css("src/styles/sidebar.css");
    expect(sheet).not.toMatch(/transition:[^;]*grid-template-rows/);
  });

  it("staggers dot-matrix cells from --i", () => {
    expect(css("src/styles/shell.css")).toMatch(/\.dot-matrix-cell[\s\S]*--i/);
  });

  it("plays review-rail exit with transform, not layout", () => {
    expect(css("src/styles/review.css")).toMatch(/\.review-rail\.rail-out/);
  });

  it("transitions shadow and outline on theme change", () => {
    const tokens = css("src/styles/tokens.css");
    expect(tokens).toMatch(/transition:[^}]*box-shadow/);
    expect(tokens).toMatch(/transition:[^}]*outline-color/);
  });

  it("defines a skeleton pulse", () => {
    expect(css("src/styles.css")).toMatch(/\.skeleton[\s\S]*skeleton-pulse/);
  });

  it("offers a CSS tooltip for data-tip", () => {
    expect(css("src/styles.css")).toMatch(/\[data-tip\]:hover::after/);
  });

  it("drops review-head tooltips below the chrome so the window edge does not clip them", () => {
    const src = css("src/styles/review.css");
    const flip = src.match(/\.review-head \[data-tip\]:hover::after[\s\S]*?\}/)?.[0] ?? "";
    expect(flip).toMatch(/top:\s*calc\(100%\s*\+\s*6px\)/);
    expect(flip).toMatch(/bottom:\s*auto/);
    const close = src.match(/\.review-head > \.icon-btn\[data-tip\]:hover::after[\s\S]*?\}/)?.[0] ?? "";
    expect(close).toMatch(/right:\s*0/);
    expect(close).toMatch(/left:\s*auto/);
    const panes = src.match(/\.review-panes button\s*\{[^}]+\}/)?.[0] ?? "";
    expect(panes).not.toMatch(/overflow:\s*hidden/);
  });

  it("keeps the main stylesheet under the 800-line house limit", () => {
    expect(css("src/styles.css").split("\n").length).toBeLessThanOrEqual(800);
  });
});

describe("brand accent surfaces", () => {
  it("defines --brand on :root without replacing --accent", () => {
    const tokens = css("src/styles/tokens.css");
    expect(tokens).toMatch(/:root\s*\{[^}]*--brand:\s*#0078[Ff][Cc]/);
    expect(tokens).toMatch(/:root\s*\{[^}]*--accent:\s*hsl\(207/);
  });

  it("washes user bubbles with a low brand mix", () => {
    const block = css("src/styles/thread.css").match(/\.msg\.user \.md\s*\{[^}]+\}/)?.[0] ?? "";
    expect(block).toMatch(/color-mix\(in srgb,\s*var\(--brand\)\s*9%,\s*var\(--bg-card\)\)/);
    const dark = css("src/styles/thread.css");
    expect(dark).toMatch(/\[data-theme="dark"\][\s\S]*?\.msg\.user \.md\s*\{[^}]*--brand\)\s*13%/);
  });

  it("uses brand on composer focus, not idle, and keeps yolo on danger", () => {
    const sheet = css("src/styles/composer.css");
    const idle = sheet.match(/(?:^|\n)\.composer\s*\{[^}]+\}/)?.[0] ?? "";
    expect(idle).toMatch(/border:\s*1px solid var\(--line\)/);
    expect(idle).not.toMatch(/--brand/);
    expect(sheet).toMatch(/\.composer:focus-within\s*\{[^}]*color-mix\(in srgb,\s*var\(--brand\)\s*50%,\s*var\(--line\)\)/);
    expect(sheet).toMatch(/\[data-mode="yolo"\] \.composer\s*\{[^}]*border-color:\s*var\(--danger\)/);
  });

  it("tints only the sidebar hairline with brand", () => {
    const block = css("src/styles/sidebar.css").match(/^\.sidebar\s*\{[^}]+\}/m)?.[0] ?? "";
    expect(block).toMatch(/border-right:\s*0\.5px solid color-mix\(in srgb,\s*var\(--brand\)\s*20%,\s*var\(--line\)\)/);
  });

  it("does not retint the send button or pane grips with --brand", () => {
    const send = css("src/styles/composer.css").match(/^\.send-btn\s*\{[^}]+\}/m)?.[0] ?? "";
    expect(send).toMatch(/background:\s*var\(--cta\)/);
    expect(send).not.toMatch(/--brand/);
    const grip = css("src/styles/panes.css").match(/\.resizer-row:hover \.resizer-grip[\s\S]*?background:\s*var\(--accent\)/);
    expect(grip).toBeTruthy();
    expect(css("src/styles/panes.css")).not.toMatch(/\.resizer-row[\s\S]{0,200}--brand/);
  });
});

