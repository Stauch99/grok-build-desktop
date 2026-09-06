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
    expect(block).toMatch(/\.composer textarea:focus-visible/);
    expect(block).not.toMatch(/textarea:focus-visible[^}]*outline:\s*none/);
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

  it("animates permission cards in", () => {
    expect(css("src/styles/overlays.css")).toMatch(/\.permission\s*\{[\s\S]*rise-in/);
  });

  it("does not animate sidebar grid-template-columns", () => {
    const app = css("src/styles.css").match(/^\.app\s*\{[^}]+\}/m)?.[0] ?? "";
    expect(app).not.toMatch(/transition:\s*grid-template-columns/);
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

  it("keeps the main stylesheet under the 800-line house limit", () => {
    expect(css("src/styles.css").split("\n").length).toBeLessThanOrEqual(800);
  });
});
