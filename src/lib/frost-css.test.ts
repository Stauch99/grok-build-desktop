import { describe, expect, it } from "vitest";
import { APP_STYLE_FILES, cssFile } from "./css-source";

const PREFIX = ':root[data-theme-family="frost"]';

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

describe("streaming caret and tool chip hover", () => {
  it("Markdown exposes a data-live hook", () => {
    const src = cssFile("src/components/Markdown.tsx");
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
