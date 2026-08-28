import { describe, expect, it } from "vitest";
import { formatClock, thoughtDuration, thoughtLineLabel, turnSeparatorLabel, usageTone } from "./time";

describe("formatClock", () => {
  it("shows only the time on the same calendar day", () => {
    const now = Date.parse("2026-08-15T16:00:00");
    expect(formatClock(Date.parse("2026-08-15T09:05:00"), now)).toBe("09:05");
  });

  it("prefixes month/day when the date differs", () => {
    const now = Date.parse("2026-08-15T16:00:00");
    expect(formatClock(Date.parse("2026-08-14T21:08:00"), now)).toBe("8/14 21:08");
  });

  it("is empty for junk timestamps", () => {
    expect(formatClock(0)).toBe("");
    expect(formatClock(Number.NaN)).toBe("");
  });
});

describe("thoughtDuration", () => {
  it("hides sub-second spans", () => {
    expect(thoughtDuration(1000, 1400)).toBeUndefined();
  });

  it("uses formatElapsed once the thought ran long enough", () => {
    expect(thoughtDuration(0, 12_000)).toBe("12秒");
    expect(thoughtDuration(0, 65_000)).toBe("1分5秒");
  });
});

describe("thoughtLineLabel", () => {
  it("says 思考中 while the thought is still live", () => {
    expect(thoughtLineLabel(0, 12_000, true)).toBe("思考中");
  });

  it("prefixes 思考了 when a duration is visible", () => {
    expect(thoughtLineLabel(0, 65_000)).toBe("思考了 1分5秒");
  });

  it("falls back to 思考 for a blink", () => {
    expect(thoughtLineLabel(1000, 1400)).toBe("思考");
    expect(thoughtLineLabel()).toBe("思考");
  });
});

describe("turnSeparatorLabel", () => {
  it("treats promptIndex 0 as 第 1 轮", () => {
    const now = Date.parse("2026-08-15T16:00:00");
    expect(turnSeparatorLabel(0, Date.parse("2026-08-15T14:32:00"), now)).toBe("第 1 轮 · 14:32");
  });

  it("falls back when the index is missing", () => {
    expect(turnSeparatorLabel(undefined, undefined)).toBe("新一轮");
  });
});

describe("usageTone", () => {
  it("is ok without a percentage", () => {
    expect(usageTone(null)).toBe("ok");
  });

  it("warns in the band below the compact threshold", () => {
    expect(usageTone(69, 85)).toBe("ok");
    expect(usageTone(70, 85)).toBe("warn");
    expect(usageTone(85, 85)).toBe("hot");
    expect(usageTone(99, 85)).toBe("hot");
  });
});
