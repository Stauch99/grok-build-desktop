import { describe, expect, it } from "vitest";
import { formatDailyFile, type DailyLine } from "./memory-ingest";
import { dailyShardPath } from "./memory-paths";
import { DREAM_LOOKBACK_DAYS, loadLookbackDays } from "./memory-daily-read";
import { selectDreamInput } from "./memory-weight";

function line(text: string, sessionId = "s1"): DailyLine {
  return { agentId: "grok", sessionId, cwd: "/p", kind: "user_pref", text };
}

function filesRead(files: Record<string, string>) {
  return async (path: string) => {
    if (!(path in files)) throw new Error(`not found: ${path}`);
    return files[path] ?? "";
  };
}

describe("loadLookbackDays", () => {
  const root = "/tmp/memory";
  const today = "2026-09-08";
  const yesterday = "2026-09-07";

  it("includes shard 2 of yesterday in the days array", async () => {
    const files = {
      [dailyShardPath(root, today, 1)]: formatDailyFile(today, [line("today rule")]),
      [dailyShardPath(root, yesterday, 1)]: formatDailyFile(yesterday, [line("yesterday shard 1")]),
      [dailyShardPath(root, yesterday, 2)]: formatDailyFile(yesterday, [line("yesterday shard 2")]),
    };
    const days = await loadLookbackDays(root, today, DREAM_LOOKBACK_DAYS, { read: filesRead(files) });
    const yesterdayDays = days.filter((d) => d.day === yesterday);
    expect(yesterdayDays.length).toBe(2);
    expect(yesterdayDays.some((d) => d.lines.some((l) => l.text === "yesterday shard 2"))).toBe(true);
  });

  it("selects today's line first over yesterday via recencyFactor", async () => {
    const files = {
      [dailyShardPath(root, today, 1)]: formatDailyFile(today, [line("today fact", "new")]),
      [dailyShardPath(root, yesterday, 1)]: formatDailyFile(yesterday, [line("yesterday fact", "old")]),
    };
    const days = await loadLookbackDays(root, today, DREAM_LOOKBACK_DAYS, { read: filesRead(files) });
    const result = selectDreamInput(days, today, { maxLines: 1 });
    expect(result.selected).toHaveLength(1);
    expect(result.selected[0]).toContain("today fact");
  });

  it("loads today and the previous lookback days, not the day after the window", async () => {
    const edge = "2026-09-01";
    const outside = "2026-08-31";
    const files = {
      [dailyShardPath(root, today, 1)]: formatDailyFile(today, [line("today")]),
      [dailyShardPath(root, edge, 1)]: formatDailyFile(edge, [line("edge of window")]),
      [dailyShardPath(root, outside, 1)]: formatDailyFile(outside, [line("too old")]),
    };
    const days = await loadLookbackDays(root, today, DREAM_LOOKBACK_DAYS, { read: filesRead(files) });
    const daySet = new Set(days.map((d) => d.day));
    expect(daySet.has(today)).toBe(true);
    expect(daySet.has(edge)).toBe(true);
    expect(daySet.has(outside)).toBe(false);
  });

  it("uses todayShards instead of disk for today after gather", async () => {
    const files = {
      [dailyShardPath(root, today, 1)]: formatDailyFile(today, [line("stale disk")]),
    };
    const days = await loadLookbackDays(root, today, 0, {
      read: filesRead(files),
      todayShards: { 1: formatDailyFile(today, [line("ingested")]) },
    });
    expect(days).toHaveLength(1);
    expect(days[0]?.day).toBe(today);
    expect(days[0]?.lines.map((l) => l.text)).toEqual(["ingested"]);
  });
});
