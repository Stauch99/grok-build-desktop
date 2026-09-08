import type { MemoryActivityDay, MemoryEventRow } from "../api";
import { shiftYmd } from "./memory-weight";
import type { DiaryEntry } from "./memory-view";

export type HeatMetric = "intimacy" | "growth";

export function intimacyRaw(day: Pick<MemoryActivityDay, "dailyLines" | "mcpAppends" | "newSessions">): number {
  return day.dailyLines + day.mcpAppends + day.newSessions * 2;
}

export function growthRaw(day: Pick<MemoryActivityDay, "promoted" | "memBytes">): number {
  return day.promoted + Math.floor(Math.max(0, day.memBytes) / 512);
}

/** Map a day's raw score onto the 5-level heatmap. */
export function heatLevel(raw: number): 0 | 1 | 2 | 3 | 4 {
  if (raw <= 0) return 0;
  if (raw < 3) return 1;
  if (raw < 8) return 2;
  if (raw < 16) return 3;
  return 4;
}

export function companionsDays(earliestDay: string | null, today: string): number {
  if (!earliestDay) return 0;
  const a = Date.parse(`${earliestDay}T00:00:00Z`);
  const b = Date.parse(`${today}T00:00:00Z`);
  if (!Number.isFinite(a) || !Number.isFinite(b) || b < a) return 0;
  return Math.floor((b - a) / 86_400_000) + 1;
}

/** Consecutive non-zero intimacy days, allowing today to still be empty. */
export function streakDays(days: MemoryActivityDay[], today: string): number {
  const byDay = new Map(days.map((d) => [d.day, intimacyRaw(d)]));
  let start = today;
  if ((byDay.get(today) ?? 0) <= 0) start = shiftYmd(today, -1);
  let n = 0;
  let cursor = start;
  while ((byDay.get(cursor) ?? 0) > 0) {
    n += 1;
    cursor = shiftYmd(cursor, -1);
    if (n > 400) break;
  }
  return n;
}

export type HeatCell = {
  day: string;
  level: 0 | 1 | 2 | 3 | 4;
  raw: number;
  monthLabel: string | null;
};

const WEEKDAYS = 7;
const WEEKS = 53;

function sundayOnOrBefore(day: string): string {
  const [y, m, d] = day.split("-").map(Number);
  const dt = new Date(Date.UTC(y, (m ?? 1) - 1, d ?? 1));
  const dow = dt.getUTCDay();
  dt.setUTCDate(dt.getUTCDate() - dow);
  return dt.toISOString().slice(0, 10);
}

const MONTH_EN = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];

export function heatmapGrid(today: string, days: MemoryActivityDay[], metric: HeatMetric): HeatCell[][] {
  const byDay = new Map(days.map((d) => [d.day, d]));
  const endSunday = sundayOnOrBefore(today);
  const start = shiftYmd(endSunday, -7 * (WEEKS - 1));
  const cols: HeatCell[][] = [];
  let seenMonth = "";
  for (let w = 0; w < WEEKS; w++) {
    const col: HeatCell[] = [];
    for (let r = 0; r < WEEKDAYS; r++) {
      const day = shiftYmd(start, w * 7 + r);
      const row = byDay.get(day);
      const raw = row ? (metric === "intimacy" ? intimacyRaw(row) : growthRaw(row)) : 0;
      const month = day.slice(5, 7);
      let monthLabel: string | null = null;
      if (r === 0 && month !== seenMonth) {
        seenMonth = month;
        monthLabel = MONTH_EN[Number(month) - 1] ?? month;
      }
      col.push({ day, level: day > today ? 0 : heatLevel(raw), raw: day > today ? 0 : raw, monthLabel });
    }
    cols.push(col);
  }
  return cols;
}

export type TimelineEvent = {
  at: number;
  kind: string;
  agent?: string | null;
  count?: number | null;
  prompts?: number | null;
  inChars?: number | null;
  outChars?: number | null;
};

export type TimelineDay = {
  day: string;
  events: TimelineEvent[];
};

export function mergeTimeline(
  events: MemoryEventRow[],
  diary: DiaryEntry[],
  timeZone: string,
): TimelineDay[] {
  const byDay = new Map<string, TimelineEvent[]>();
  const dayOf = (ms: number) => {
    const parts = new Intl.DateTimeFormat("en-CA", {
      timeZone,
      year: "numeric",
      month: "2-digit",
      day: "2-digit",
    }).formatToParts(new Date(ms));
    const y = parts.find((p) => p.type === "year")?.value;
    const m = parts.find((p) => p.type === "month")?.value;
    const d = parts.find((p) => p.type === "day")?.value;
    return `${y}-${m}-${d}`;
  };
  for (const e of events) {
    const day = dayOf(e.at);
    const list = byDay.get(day) ?? [];
    list.push({
      at: e.at,
      kind: e.kind,
      agent: e.agent,
      count: e.count,
      prompts: e.prompts,
      inChars: e.inChars,
      outChars: e.outChars,
    });
    byDay.set(day, list);
  }
  for (const entry of diary) {
    if (!byDay.has(entry.date)) byDay.set(entry.date, []);
  }
  return [...byDay.entries()]
    .sort((a, b) => a[0].localeCompare(b[0]))
    .map(([day, ev]) => ({ day, events: ev.sort((x, y) => x.at - y.at) }));
}
