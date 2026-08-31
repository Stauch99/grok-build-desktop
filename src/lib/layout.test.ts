import { describe, expect, it } from "vitest";
import {
  clamp,
  clampPreview,
  clampSidebar,
  fitLayout,
  loadWidth,
  maxFor,
  PREVIEW,
  SIDEBAR,
  WINDOW_MIN,
  WORK_MIN,
} from "./layout";

describe("clamp", () => {
  it("keeps a value inside the range", () => {
    expect(clamp(300, 200, 400)).toBe(300);
    expect(clamp(100, 200, 400)).toBe(200);
    expect(clamp(900, 200, 400)).toBe(400);
  });

  it("rounds to whole pixels", () => {
    expect(clamp(300.6, 200, 400)).toBe(301);
  });

  it("falls back to the minimum for junk", () => {
    expect(clamp(Number.NaN, 200, 400)).toBe(200);
  });
});

describe("maxFor", () => {
  it("leaves room for the conversation column", () => {
    expect(maxFor(SIDEBAR, 1000, 300)).toBe(1000 - 300 - WORK_MIN);
  });

  it("never exceeds the declared maximum", () => {
    expect(maxFor(SIDEBAR, 4000, 0)).toBe(SIDEBAR.max);
  });

  it("never drops below the declared minimum, even in a tiny window", () => {
    expect(maxFor(SIDEBAR, 400, 300)).toBe(SIDEBAR.min);
  });
});

describe("clampSidebar / clampPreview", () => {
  it("respects each column's own bounds", () => {
    expect(clampSidebar(50, 1600)).toBe(SIDEBAR.min);
    expect(clampSidebar(9999, 1600)).toBe(SIDEBAR.max);
    expect(clampPreview(50, 1600)).toBe(PREVIEW.min);
    expect(clampPreview(9999, 2000)).toBe(PREVIEW.max);
  });

  it("shrinks a side column when the other one is already wide", () => {
    // 1000 wide, preview at 500 → sidebar can only take 1000-500-360 = 140,
    // which is below its own minimum, so the minimum wins.
    expect(clampSidebar(400, 1000, 500)).toBe(SIDEBAR.min);
  });

  it("allows the full width when there is room", () => {
    expect(clampSidebar(300, 1600, 400)).toBe(300);
  });
});

describe("fitLayout", () => {
  it("leaves a comfortable window untouched", () => {
    expect(fitLayout(300, 500, 1600, true)).toEqual({ sidebar: 300, preview: 500 });
  });

  it("shrinks the preview first when the window narrows", () => {
    const { sidebar, preview } = fitLayout(300, 700, 1000, true);
    expect(preview).toBeLessThan(700);
    expect(sidebar + preview + WORK_MIN).toBeLessThanOrEqual(1000);
  });

  it("ignores the preview width while the pane is closed", () => {
    expect(fitLayout(300, 700, 900, false)).toEqual({ sidebar: 300, preview: 700 });
  });

  it("keeps both columns at their minimum in a very small window", () => {
    const { sidebar, preview } = fitLayout(400, 600, 500, true);
    expect(sidebar).toBe(SIDEBAR.min);
    expect(preview).toBe(PREVIEW.min);
  });
});

describe("window minimum invariant", () => {
  it("fits all three columns inside the smallest allowed window", () => {
    expect(SIDEBAR.min + PREVIEW.min + WORK_MIN + 10).toBeLessThanOrEqual(WINDOW_MIN.width);
  });

  it("lets the preview grow wide enough to read markdown", () => {
    expect(PREVIEW.max).toBeGreaterThanOrEqual(1080);
    expect(PREVIEW.initial).toBeGreaterThanOrEqual(520);
  });
});

describe("loadWidth", () => {
  it("uses the default when nothing is stored", () => {
    expect(loadWidth(undefined, SIDEBAR)).toBe(SIDEBAR.initial);
    expect(loadWidth("300", SIDEBAR)).toBe(SIDEBAR.initial);
  });

  it("clamps a stored value that is out of range", () => {
    expect(loadWidth(9999, SIDEBAR)).toBe(SIDEBAR.max);
    expect(loadWidth(10, PREVIEW)).toBe(PREVIEW.min);
  });

  it("keeps a valid stored value", () => {
    expect(loadWidth(310, SIDEBAR)).toBe(310);
  });
});
