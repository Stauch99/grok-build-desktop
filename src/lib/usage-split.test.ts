import { describe, expect, it } from "vitest";
import {
  formatStatsFooter,
  parseUsageSplit,
  sparklinePoints,
  splitCostByModel,
  statsLine,
  turnStatsFromItems,
  usageBreakdownLines,
  usageRingPercents,
  usageTrend,
} from "./usage-split";

describe("parseUsageSplit", () => {
  it("reads input / output / cache and derives used", () => {
    const u = parseUsageSplit({ input: 100, output: 20, cache: 30, size: 1000 });
    expect(u).toEqual({ input: 100, output: 20, cache: 30, size: 1000, used: 150 });
  });
});

describe("usageRingPercents", () => {
  it("splits the ring against the window", () => {
    expect(usageRingPercents({ input: 100, output: 50, cache: 50, used: 200, size: 1000 })).toEqual({
      input: 10,
      output: 5,
      cache: 5,
      used: 20,
    });
  });
});

describe("usageBreakdownLines", () => {
  it("names input output cache with counts", () => {
    expect(usageBreakdownLines({ input: 100, output: 20, cache: 5, used: 125, size: 1000 })).toEqual([
      "input 100",
      "output 20",
      "cache 5",
    ]);
  });

  it("omits missing slices", () => {
    expect(usageBreakdownLines({ used: 10, size: 100 })).toEqual([]);
  });
});

describe("statsLine", () => {
  it("is null without a start time", () => {
    expect(statsLine({})).toBeNull();
  });

  it("reports TTFT and tok/s when the turn finished", () => {
    expect(statsLine({ startedAt: 1000, firstTokenAt: 1300, endedAt: 2000, outputTokens: 50 })).toEqual({
      ttftMs: 300,
      toksPerSec: 50,
    });
  });

  it("is null when the turn ended before it started", () => {
    expect(statsLine({ startedAt: 2000, firstTokenAt: 1000, endedAt: 1500, outputTokens: 50 })).toBeNull();
  });
});

describe("turnStatsFromItems", () => {
  it("pairs the last assistant with the user before it", () => {
    expect(
      turnStatsFromItems(
        [
          { kind: "user", at: 1000 },
          { kind: "assistant", at: 1300, until: 2000 },
          { kind: "user", at: 3000 },
        ],
        50,
      ),
    ).toEqual({ ttftMs: 300, toksPerSec: 50 });
  });
});

describe("formatStatsFooter", () => {
  it("joins compact latency, rate, and session tokens", () => {
    expect(formatStatsFooter({ ttftMs: 300, toksPerSec: 50, sessionTokens: 12400 })).toBe(
      "TTFT 300ms · 50 tok/s · 12.4k tok",
    );
  });

  it("collapses long TTFT into minutes", () => {
    expect(formatStatsFooter({ ttftMs: 342000, toksPerSec: 0, sessionTokens: 847 })).toBe(
      "TTFT 5.7m · 0 tok/s · 847 tok",
    );
  });

  it("uses dashes when a value is missing", () => {
    expect(formatStatsFooter({})).toBe("TTFT — · — tok/s · — tok");
  });
});

describe("usageTrend", () => {
  it("keeps points inside the window", () => {
    const now = 1_000_000_000_000;
    const pts = usageTrend(
      [
        { at: now - 8 * 86400000, used: 1, size: 10 },
        { at: now - 2 * 86400000, used: 2, size: 10 },
      ],
      7,
      now,
    );
    expect(pts).toHaveLength(1);
    expect(pts[0]?.used).toBe(2);
  });
});

describe("splitCostByModel", () => {
  it("sums cost ticks by model", () => {
    expect(
      splitCostByModel([
        { model: "grok-4.6", cost: 10 },
        { model: "grok-4.5", cost: 3 },
        { model: "grok-4.6", cost: 2 },
      ]),
    ).toEqual({ "grok-4.6": 12, "grok-4.5": 3 });
  });

  it("buckets missing or blank models as unknown", () => {
    expect(splitCostByModel([{ cost: 4 }, { model: "  ", cost: 1 }, { model: "grok-4.6", cost: 5 }])).toEqual({
      unknown: 5,
      "grok-4.6": 5,
    });
  });

  it("returns an empty record for no ticks", () => {
    expect(splitCostByModel([])).toEqual({});
  });
});

describe("sparklinePoints", () => {
  it("maps usageHistory into an svg polyline in time order", () => {
    expect(
      sparklinePoints(
        [
          { at: 30, used: 100 },
          { at: 10, used: 0 },
          { at: 20, used: 50 },
        ],
        100,
        20,
      ),
    ).toBe("0,20 50,10 100,0");
  });

  it("is empty when there is no history", () => {
    expect(sparklinePoints([], 100, 20)).toBe("");
  });
});
