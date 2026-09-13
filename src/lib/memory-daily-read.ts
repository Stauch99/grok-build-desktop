import { parseDailyFile, type DailyLine } from "./memory-ingest";
import { dailyShardPath, DAILY_MAX_SHARDS } from "./memory-paths";
import { shiftYmd } from "./memory-weight";

/** OpenClaw REM lookback: today plus the previous 7 local days. */
export const DREAM_LOOKBACK_DAYS = 7;

export type DreamDayInput = { lines: DailyLine[]; day: string };

export type DailyTextRead = (path: string) => Promise<string>;

export type LoadLookbackOpts = {
  read?: DailyTextRead;
  todayShards?: Record<number, string>;
  todayFallback?: string;
};

function shardIndexes(shards: Record<number, string>): number[] {
  return Object.keys(shards)
    .map(Number)
    .filter((index) => Number.isInteger(index) && index >= 1 && index <= DAILY_MAX_SHARDS)
    .sort((a, b) => a - b);
}

export function shardsToDays(
  shards: Record<number, string>,
  day: string,
  fallbackDailyMd = "",
): DreamDayInput[] {
  const indexes = shardIndexes(shards);
  if (!indexes.length) return [{ lines: parseDailyFile(fallbackDailyMd), day }];
  return indexes.map((index) => ({ lines: parseDailyFile(shards[index] ?? ""), day }));
}

async function defaultRead(path: string, root: string): Promise<string> {
  const { readTextFile } = await import("../api");
  return (await readTextFile(path, root)).text;
}

async function loadDayShards(root: string, day: string, read: DailyTextRead): Promise<Record<number, string>> {
  const shards: Record<number, string> = {};
  await Promise.all(
    Array.from({ length: DAILY_MAX_SHARDS }, (_, i) => i + 1).map(async (index) => {
      try {
        const text = await read(dailyShardPath(root, day, index));
        if (text) shards[index] = text;
      } catch {
        /* missing shard */
      }
    }),
  );
  return shards;
}

/**
 * Load daily shards for `today` and the previous `lookbackDays` calendar days.
 * Gather may pass `todayShards` so main sees post-ingest today without re-reading disk.
 */
export async function loadLookbackDays(
  root: string,
  today: string,
  lookbackDays = DREAM_LOOKBACK_DAYS,
  opts?: LoadLookbackOpts,
): Promise<DreamDayInput[]> {
  const read = opts?.read ?? ((path) => defaultRead(path, root));
  const span = Math.max(0, lookbackDays);
  const loaded = await Promise.all(
    Array.from({ length: span + 1 }, async (_, offset) => {
      const day = shiftYmd(today, -offset);
      const shards =
        offset === 0 && opts?.todayShards ? opts.todayShards : await loadDayShards(root, day, read);
      if (offset !== 0 && !shardIndexes(shards).length) return { offset, entries: [] as DreamDayInput[] };
      const fallback = offset === 0 ? (opts?.todayFallback ?? "") : "";
      return { offset, entries: shardsToDays(shards, day, fallback) };
    }),
  );
  loaded.sort((a, b) => a.offset - b.offset);
  return loaded.flatMap((row) => row.entries);
}
