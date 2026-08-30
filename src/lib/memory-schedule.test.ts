import { describe, expect, it } from "vitest";
import { armRecurringLocalHour, nextLocalHour, shouldCatchUp } from "./memory-schedule";

describe("nextLocalHour", () => {
  it("returns a later 03:00 in UTC", () => {
    const now = Date.parse("2026-08-30T04:00:00Z");
    const next = nextLocalHour(now, "UTC", 3);
    expect(next).toBe(Date.parse("2026-08-31T03:00:00Z"));
  });

  it("returns local 03:00 in Asia/Kolkata (UTC+5:30)", () => {
    const now = Date.parse("2026-08-30T04:00:00Z");
    const next = nextLocalHour(now, "Asia/Kolkata", 3);
    expect(next).toBe(Date.parse("2026-08-30T21:30:00Z"));
  });
});

describe("armRecurringLocalHour", () => {
  it("re-arms the next local hour after fire and clears on unmount", () => {
    const timeouts: Array<{ fn: () => void; ms: number }> = [];
    let now = Date.parse("2026-08-30T04:00:00Z");
    let fires = 0;
    let cleared = 0;
    const stop = armRecurringLocalHour({
      hour: 3,
      timeZone: "UTC",
      now: () => now,
      onFire: () => {
        fires += 1;
      },
      setTimeout: (fn, ms) => {
        timeouts.push({ fn, ms });
        return timeouts.length;
      },
      clearTimeout: () => {
        cleared += 1;
      },
    });
    expect(timeouts).toHaveLength(1);
    expect(timeouts[0].ms).toBe(Date.parse("2026-08-31T03:00:00Z") - Date.parse("2026-08-30T04:00:00Z"));
    now = Date.parse("2026-08-31T03:00:00Z");
    timeouts[0].fn();
    expect(fires).toBe(1);
    expect(timeouts).toHaveLength(2);
    expect(timeouts[1].ms).toBe(Date.parse("2026-09-01T03:00:00Z") - Date.parse("2026-08-31T03:00:00Z"));
    stop();
    expect(cleared).toBe(1);
  });
});

describe("shouldCatchUp", () => {
  it("catches up when yesterday never dreamed", () => {
    expect(shouldCatchUp({ now: Date.parse("2026-08-31T10:00:00Z"), lastDeepAt: Date.parse("2026-08-30T03:00:00Z"), timeZone: "UTC" })).toBe(true);
    expect(shouldCatchUp({ now: Date.parse("2026-08-30T10:00:00Z"), lastDeepAt: Date.parse("2026-08-30T03:00:00Z"), timeZone: "UTC" })).toBe(false);
    expect(shouldCatchUp({ now: Date.parse("2026-08-30T10:00:00Z"), lastDeepAt: null, timeZone: "UTC" })).toBe(true);
  });
});
