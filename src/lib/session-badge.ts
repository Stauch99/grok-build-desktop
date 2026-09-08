import type { SessionStatus } from "./session-status";
import { isAttention } from "./session-status";

export type SessionChrome = "count" | "idle-dot" | "none";

/** Dock / row badge: only sessions waiting on the user. */
export function countNeedsYou(statuses: SessionStatus[]): number {
  return statuses.filter((status) => status === "needs-you").length;
}

/**
 * Dock badge: sessions actively asking for the user — a pending permission /
 * question, or an errored turn you have not seen yet. Plain "done" stays off
 * the badge (it keeps the quiet idle dot) so the number means "act on me".
 */
export function countAttention(statuses: SessionStatus[]): number {
  return statuses.filter(isAttention).length;
}

/** Completed runs keep a quiet idle dot instead of incrementing the number. */
export function chromeForStatus(status: SessionStatus): SessionChrome {
  if (status === "needs-you") return "count";
  if (status === "done") return "idle-dot";
  return "none";
}

