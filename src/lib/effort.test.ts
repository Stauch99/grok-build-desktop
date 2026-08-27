import { describe, expect, it } from "vitest";
import {
  DEFAULT_EFFORT,
  EFFORT_OPTIONS,
  effortLabel,
  nextEffort,
  normalizeEffort,
} from "./effort";

describe("effort helpers", () => {
  it("labels are short Chinese, not raw ids", () => {
    expect(effortLabel("low")).toBe("快速");
    expect(effortLabel("medium")).toBe("标准");
    expect(effortLabel("high")).toBe("深入");
    expect(effortLabel("xhigh")).toBe("最强");
    expect(EFFORT_OPTIONS.every((o) => o.label !== o.id)).toBe(true);
  });

  it("normalizes unknown values to default", () => {
    expect(normalizeEffort(undefined)).toBe(DEFAULT_EFFORT);
    expect(normalizeEffort("bogus")).toBe(DEFAULT_EFFORT);
    expect(normalizeEffort("xhigh")).toBe("xhigh");
  });

  it("cycles through all levels", () => {
    expect(nextEffort("low")).toBe("medium");
    expect(nextEffort("medium")).toBe("high");
    expect(nextEffort("high")).toBe("xhigh");
    expect(nextEffort("xhigh")).toBe("low");
  });
});
