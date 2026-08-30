import { describe, expect, it } from "vitest";
import { nextLocalHour, shouldCatchUp } from "./memory-schedule";

describe("nextLocalHour", () => {
  it("returns a later 03:00 in UTC", () => {
    const now = Date.parse("2026-08-30T04:00:00Z");
    const next = nextLocalHour(now, "UTC", 3);
    expect(next).toBe(Date.parse("2026-08-31T03:00:00Z"));
  });
});

describe("shouldCatchUp", () => {
  it("catches up when yesterday never dreamed", () => {
    expect(shouldCatchUp({ now: Date.parse("2026-08-31T10:00:00Z"), lastDeepAt: Date.parse("2026-08-30T03:00:00Z"), timeZone: "UTC" })).toBe(true);
    expect(shouldCatchUp({ now: Date.parse("2026-08-30T10:00:00Z"), lastDeepAt: Date.parse("2026-08-30T03:00:00Z"), timeZone: "UTC" })).toBe(false);
    expect(shouldCatchUp({ now: Date.parse("2026-08-30T10:00:00Z"), lastDeepAt: null, timeZone: "UTC" })).toBe(true);
  });
});
