import { describe, expect, it } from "vitest";
import { parseWeeklyUsage, weeklyResetLabel, weeklyUsageCopy } from "./weekly-usage";

const SAMPLE = {
  config: {
    creditUsagePercent: 50,
    currentPeriod: {
      type: "USAGE_PERIOD_TYPE_WEEKLY",
      start: "2026-08-24T00:19:40.450326+00:00",
      end: "2026-08-31T00:19:40.450326+00:00",
    },
    billingPeriodEnd: "2026-08-31T00:19:40.450326+00:00",
  },
  subscription_tier: "SuperGrok Heavy",
};

describe("parseWeeklyUsage", () => {
  it("reads the weekly credit window from _x.ai/billing", () => {
    expect(parseWeeklyUsage(SAMPLE)).toEqual({
      percent: 50,
      periodEnd: Date.parse("2026-08-31T00:19:40.450326+00:00"),
      tier: "SuperGrok Heavy",
    });
  });

  it("clamps and ignores junk", () => {
    expect(parseWeeklyUsage({ config: { creditUsagePercent: 140 } })?.percent).toBe(100);
    expect(parseWeeklyUsage({ config: {} })).toBeNull();
    expect(parseWeeklyUsage(null)).toBeNull();
  });
});

describe("weeklyResetLabel", () => {
  it("names the calendar day in local time", () => {
    const end = new Date(2026, 7, 31, 8, 19).getTime();
    const now = new Date(2026, 7, 28, 12).getTime();
    expect(weeklyResetLabel(end, now)).toBe("8月31日重置");
  });

  it("marks an already-closed window", () => {
    const end = new Date(2026, 7, 31, 8, 19).getTime();
    expect(weeklyResetLabel(end, new Date(2026, 7, 31, 9).getTime())).toBe("即将重置");
  });
});

describe("weeklyUsageCopy", () => {
  it("falls back to sign-in state when billing is missing", () => {
    expect(weeklyUsageCopy(null, false).title).toBe("未登录");
    expect(weeklyUsageCopy(null, true).title).toBe("已登录");
  });

  it("shows the weekly percent in the account slot", () => {
    const end = Date.parse(SAMPLE.config.currentPeriod.end);
    const now = end - 3 * 24 * 60 * 60 * 1000;
    const copy = weeklyUsageCopy(parseWeeklyUsage(SAMPLE), true, now);
    expect(copy.title).toBe("周用量 50%");
    expect(copy.percent).toBe(50);
    expect(copy.detail).toMatch(/^\d+月\d+日重置$/);
  });

  it("switches account copy with locale", () => {
    const end = Date.parse(SAMPLE.config.currentPeriod.end);
    const now = end - 3 * 24 * 60 * 60 * 1000;
    expect(weeklyUsageCopy(null, false, now, "en").title).toBe("Not signed in");
    expect(weeklyUsageCopy(parseWeeklyUsage(SAMPLE), true, now, "en")).toMatchObject({
      title: "Weekly 50%",
      percent: 50,
    });
    expect(weeklyResetLabel(end, now, "en")).toMatch(/^Resets \d+\/\d+$/);
  });
});
