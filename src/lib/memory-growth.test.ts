import { describe, expect, it } from "vitest";
import type { MemoryActivityDay } from "../api";
import {
  companionsDays,
  growthRaw,
  heatLevel,
  heatmapGrid,
  intimacyRaw,
  mergeTimeline,
  streakDays,
} from "./memory-growth";

function day(partial: Partial<MemoryActivityDay> & { day: string }): MemoryActivityDay {
  return {
    dailyLines: 0,
    mcpAppends: 0,
    newSessions: 0,
    promoted: 0,
    memBytes: 0,
    ...partial,
  };
}

describe("heat metrics", () => {
  it("scores intimacy and growth per the plan formula", () => {
    expect(intimacyRaw({ dailyLines: 2, mcpAppends: 1, newSessions: 3 })).toBe(2 + 1 + 6);
    expect(growthRaw({ promoted: 3, memBytes: 1024 })).toBe(3 + 2);
    expect(heatLevel(0)).toBe(0);
    expect(heatLevel(2)).toBe(1);
    expect(heatLevel(7)).toBe(2);
    expect(heatLevel(15)).toBe(3);
    expect(heatLevel(16)).toBe(4);
  });
});

describe("companionsDays / streakDays", () => {
  it("counts inclusive calendar days from the earliest daily file", () => {
    expect(companionsDays("2026-09-01", "2026-09-08")).toBe(8);
    expect(companionsDays(null, "2026-09-08")).toBe(0);
  });

  it("counts consecutive intimacy from today, or yesterday if today is empty", () => {
    const days = [
      day({ day: "2026-09-06", dailyLines: 1 }),
      day({ day: "2026-09-07", dailyLines: 2 }),
    ];
    expect(streakDays(days, "2026-09-08")).toBe(2);
    expect(streakDays([...days, day({ day: "2026-09-08", dailyLines: 1 })], "2026-09-08")).toBe(3);
    expect(streakDays([], "2026-09-08")).toBe(0);
  });
});

describe("heatmapGrid", () => {
  it("builds 53 week columns of 7 cells and bins activity", () => {
    const grid = heatmapGrid("2026-09-08", [day({ day: "2026-09-08", dailyLines: 20 })], "intimacy");
    expect(grid).toHaveLength(53);
    expect(grid[0]).toHaveLength(7);
    const cells = grid.flat();
    const today = cells.find((c) => c.day === "2026-09-08");
    expect(today?.level).toBe(4);
    expect(cells.every((c) => c.day <= "2026-09-08" || c.level === 0)).toBe(true);
  });
});

describe("mergeTimeline", () => {
  it("groups events by local day and keeps diary dates even without events", () => {
    const rows = mergeTimeline(
      [
        { at: Date.parse("2026-09-01T12:00:00+08:00"), kind: "promote", count: 3 },
        { at: Date.parse("2026-09-01T18:00:00+08:00"), kind: "dream_sweep", prompts: 1, inChars: 8200 },
      ],
      [{ date: "2026-08-30", body: "hello" }],
      "Asia/Shanghai",
    );
    expect(rows.map((r) => r.day)).toEqual(["2026-08-30", "2026-09-01"]);
    expect(rows[1].events).toHaveLength(2);
    expect(rows[1].events[0].kind).toBe("promote");
  });
});
