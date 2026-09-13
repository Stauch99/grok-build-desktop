import { describe, expect, it } from "vitest";
import {
  DEFAULT_EFFORT,
  EFFORT_OPTIONS,
  coerceEffort,
  effortHint,
  effortLabel,
  effortMenuOptions,
  nextEffort,
  normalizeEffort,
} from "./effort";

describe("effort helpers", () => {
  it("labels are Grok effort vocab, not raw ids", () => {
    expect(effortLabel("low")).toBe("Low");
    expect(effortLabel("medium")).toBe("Medium");
    expect(effortLabel("high")).toBe("High");
    expect(effortLabel("xhigh")).toBe("xHigh");
    expect(EFFORT_OPTIONS.map((o) => o.label)).toEqual(["Low", "Medium", "High", "xHigh"]);
    expect(EFFORT_OPTIONS.every((o) => o.label !== o.id)).toBe(true);
    expect(effortLabel("xhigh")).not.toBe("xhigh");
  });

  it("falls back to Medium when the value is missing", () => {
    expect(effortLabel("")).toBe("Medium");
  });

  it("labels CLI-specific rungs without coercing them to Medium", () => {
    expect(effortLabel("max")).toBe("Max");
    expect(effortLabel("none")).toBe("Off");
    expect(effortLabel("ultracode")).toBe("Ultracode");
    expect(effortLabel("bogus")).toBe("Bogus");
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

  it("snaps effort to a model’s allowed rungs", () => {
    expect(coerceEffort("max", ["low", "high", "max"])).toBe("max");
    expect(coerceEffort("xhigh", ["low", "high", "max"], "high")).toBe("high");
    expect(effortMenuOptions(["low", "max"]).map((o) => o.label)).toEqual(["Low", "Max"]);
    expect(effortHint("max")).toBe("最高档");
    expect(effortHint("ultracode")).toBe("工作流 + 最深思考");
  });
});
