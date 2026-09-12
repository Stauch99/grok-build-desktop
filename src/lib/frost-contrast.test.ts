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
