/**
 * Stall detection for a running turn.
 *
 * The most-reported failure in this product category is an agent that goes
 * silent mid-turn with no spinner change, no error, and no indication that
 * anything is wrong — the user waits minutes before realising. Nobody ships a
 * watchdog for it, and it costs almost nothing: if nothing has arrived for a
 * while, say so.
 */

/** Quiet this long mid-turn and we start saying so. */
export const STALL_WARN_MS = 15_000;
/** Quiet this long and we suggest the turn may be wedged. */
export const STALL_HARD_MS = 60_000;

export type StallLevel = "ok" | "quiet" | "stuck";

export function stallLevel(sinceLastActivityMs: number): StallLevel {
  if (sinceLastActivityMs >= STALL_HARD_MS) return "stuck";
  if (sinceLastActivityMs >= STALL_WARN_MS) return "quiet";
  return "ok";
}

/**
 * Text appended to the wait pill. Empty while things are moving, so a healthy
 * turn shows nothing extra.
 */
export function stallNote(sinceLastActivityMs: number): string {
  const level = stallLevel(sinceLastActivityMs);
  if (level === "ok") return "";
  const secs = Math.floor(sinceLastActivityMs / 1000);
  if (level === "stuck") {
    const mins = Math.floor(secs / 60);
    return `已 ${mins} 分钟没有新输出，可能卡住了`;
  }
  return `已 ${secs} 秒没有新输出`;
}

/**
 * A turn's activity fingerprint. When this changes, the agent produced
 * something — a token, a tool update, a plan entry.
 */
export function activityKey(
  itemCount: number,
  lastItemLength: number,
  toolStatuses: string,
): string {
  return `${itemCount}:${lastItemLength}:${toolStatuses}`;
}
