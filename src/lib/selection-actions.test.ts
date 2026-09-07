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
