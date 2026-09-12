import { formatElapsed } from "./chat";

/** Wall clock for a chat item. Same calendar day → `14:32`; otherwise `8/15 14:32`. */
export function formatClock(ms: number, now = Date.now()): string {
  if (!Number.isFinite(ms) || ms <= 0) return "";
  const d = new Date(ms);
  const hh = String(d.getHours()).padStart(2, "0");
  const mm = String(d.getMinutes()).padStart(2, "0");
  const sameDay = new Date(now).toDateString() === d.toDateString();
  if (sameDay) return `${hh}:${mm}`;
  return `${d.getMonth() + 1}/${d.getDate()} ${hh}:${mm}`;
}

/** Fold meta for a thought block. Hidden when the span is under half a second. */
export function thoughtDuration(at?: number, until?: number): string | undefined {
  if (at == null || until == null || until < at) return undefined;
  const ms = until - at;
  if (ms < 500) return undefined;
  return formatElapsed(ms);
}

/** Timeline label: 思考中 / 思考了 1分5秒 / 思考. */
export function thoughtLineLabel(at?: number, until?: number, live = false): string {
  if (live) return "思考中";
  const d = thoughtDuration(at, until);
  return d ? `思考了 ${d}` : "思考";
}

/**
 * Label above a user turn. `turn` is the ACP promptIndex when present;
 * otherwise pass a 1-based count of user messages so far.
 */
export function turnSeparatorLabel(
  turn: number | undefined,
  at: number | undefined,
  now = Date.now(),
): string {
  const n = turn != null && Number.isFinite(turn) && turn >= 0 ? Math.floor(turn) + 1 : undefined;
  const clock = at != null ? formatClock(at, now) : "";
  const head = n != null ? `第 ${n} 轮` : "新一轮";
  return clock ? `${head} · ${clock}` : head;
}

export type UsageTone = "ok" | "warn" | "hot";

/** `hot` at the compact threshold, `warn` in the 15-point band below it. */
export function usageTone(pct: number | null, compactPercent = 85): UsageTone {
  if (pct == null) return "ok";
  const cap = Number.isFinite(compactPercent) ? compactPercent : 85;
  if (pct >= cap) return "hot";
  if (pct >= Math.max(0, cap - 15)) return "warn";
  return "ok";
}
