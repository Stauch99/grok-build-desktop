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

  it("animates new spine rows and count ticks instead of snapping", () => {
    const src = cssFile("src/styles/thread.css");
    expect(src).toMatch(/\.spine-slot\s*\{[^}]*animation:\s*spine-slot/);
    expect(src).toMatch(/\.spine-slot\s*>\s*\.spine-row\s*\{[^}]*animation:\s*spine-fade/);
    expect(src).toMatch(/\.spine-row\.tick \.spine-verb\s*\{[^}]*animation:\s*spine-tick/);
    const slot = src.match(/@keyframes spine-slot\s*\{[\s\S]*?\n\}/)?.[0] ?? "";
    expect(slot).toMatch(/grid-template-rows:\s*0fr/);
    expect(slot).toMatch(/grid-template-rows:\s*1fr/);
    expect(slot).not.toMatch(/opacity/);
    expect(src).toMatch(/\.spine-slot\s*\{[^}]*align-items:\s*end/);
    expect(src).toMatch(/\.spine-slot\s*>\s*\.spine-row\s*\{[^}]*align-content:\s*end/);
    const fade = src.match(/@keyframes spine-fade\s*\{[\s\S]*?\n\}/)?.[0] ?? "";
    expect(fade).toMatch(/opacity:\s*0/);
    expect(fade).toMatch(/opacity:\s*1/);
    expect(fade).toMatch(/translateY\(\s*[1-9]/);
    expect(fade).not.toMatch(/translateY\(\s*-/);
    expect(src).toMatch(/spine-fade\s+[\d.]+ms/);
    expect(src).toMatch(/spine-slot\s+[\d.]+ms/);
    const fadeMs = Number(src.match(/spine-fade\s+(\d+(?:\.\d+)?)ms/)?.[1] ?? 0);
    const slotMs = Number(src.match(/spine-slot\s+(\d+(?:\.\d+)?)ms/)?.[1] ?? 0);
    expect(fadeMs).toBeGreaterThanOrEqual(400);
    expect(slotMs).toBeGreaterThanOrEqual(700);
    expect(src).toMatch(/spine-slot\s+\d+(?:\.\d+)?ms\s+var\(--ease-in-out\)/);
    const tick = src.match(/@keyframes spine-tick\s*\{[\s\S]*?\n\}/)?.[0] ?? "";
    expect(tick).toMatch(/opacity/);
    expect(tick).toMatch(/translateY/);
  });
});

describe("streaming surface and tool chip hover", () => {
  it("Markdown exposes a data-live hook without a blinking caret", () => {
    const src = cssFile("src/components/Markdown.tsx");
    expect(src).toMatch(/data-live=\{live \? "" : undefined\}/);
    const css = cssFile("src/styles/thread.css");
    expect(css).not.toMatch(/\.md\[data-live\]/);
    expect(css).not.toMatch(/caret-blink/);
  });

  it("does not lift tool-result on hover", () => {
    const src = cssFile("src/styles/thread.css");
    expect(src).not.toMatch(/\.tool-result:hover\s*\{[^}]*translateY/);
  });
});

describe("composer and palette polish", () => {
  it("adds an accent focus ring while keeping the border-color rule", () => {
    const src = cssFile("src/styles/composer.css");
    expect(src).toMatch(/\.composer:focus-within\s*\{[^}]*border-color:/);
    expect(src).toMatch(/\.composer:focus-within\s*\{[^}]*box-shadow: 0 0 0 1px var\(--accent\)/);
  });

  it("does not stagger composer chips on every child", () => {
    const src = cssFile("src/styles/composer.css");
    expect(src).toMatch(/\.composer-chips > \*\s*\{[^}]*animation:\s*none/);
  });

  it("gives the palette empty state a dashed ring", () => {
    const src = cssFile("src/styles/palette.css");
    expect(src).toMatch(/\.palette-empty\s*\{[^}]*1px dashed var\(--line\)/);
  });
});

describe("work-run progress", () => {
  it("does not draw a jumping accent bar under a live run", () => {
    const src = cssFile("src/styles/thread.css");
    expect(src).not.toMatch(/\.work-run\.live \.work-run-bar::after/);
    expect(src).not.toMatch(/@keyframes run-progress/);
  });

  it("freezes the pixel grid under reduced motion", () => {
    const src = cssFile("src/styles.css");
    const idx = src.indexOf("@media (prefers-reduced-motion: reduce)");
    const chunk = src.slice(idx, idx + 2200);
    expect(chunk).toMatch(/\.dot-matrix-cell[\s\S]*animation:\s*none/);
    expect(chunk).not.toMatch(/run-progress/);
  });
});

describe("cards and messages motion", () => {
  it("animates the newest message and permission cards on entry", () => {
    const src = cssFile("src/styles/thread.css");
    expect(src).toMatch(
      /\.thread > \.msg:last-child[^{]*\.thread > \.turn-user:last-child > \.msg\s*\{[^}]*animation:\s*spine-enter/,
    );
    expect(src).not.toMatch(/\.thread \.msg:last-child\s*\{/);
    expect(src).not.toMatch(/\.permission\s*\{[^}]*animation:/);
    const overlays = cssFile("src/styles/overlays.css");
    expect(overlays).toMatch(/\.permission\s*\{[^}]*animation:[^}]*rise-in/);
    expect(overlays).not.toMatch(/perm-pulse/);
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
