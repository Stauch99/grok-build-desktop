import type { SessionStatus } from "./session-status";

export type SessionChrome = "count" | "idle-dot" | "none";

/** Dock / row badge: only sessions waiting on the user. */
export function countNeedsYou(statuses: SessionStatus[]): number {
  return statuses.filter((status) => status === "needs-you").length;
}

/** Completed runs keep a quiet idle dot instead of incrementing the number. */
export function chromeForStatus(status: SessionStatus): SessionChrome {
  if (status === "needs-you") return "count";
  if (status === "done") return "idle-dot";
  return "none";
}
