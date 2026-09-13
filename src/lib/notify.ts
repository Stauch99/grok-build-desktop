import { t } from "./i18n";

export type NotifyReason = "turn-done" | "permission";

export type NotifyInput = {
  reason: NotifyReason;
  /** Whether the app window currently has OS focus. */
  windowFocused: boolean;
  /** Whether this event belongs to the pane/session the user is looking at. */
  sessionFocused: boolean;
  /** How long the turn ran. Ignored for permission prompts. */
  elapsedMs?: number;
};

/** Turns shorter than this are not worth a ping if you were already on that session. */
export const SHORT_TURN_MS = 15_000;

/**
 * Notify when the user is not looking at the session that needs them.
 * A permission prompt always notifies if you left that session (or the window).
 * A finished turn on another session always notifies; a turn on the focused
 * session only notifies if the window was in the background long enough.
 */
export function shouldNotify({
  reason,
  windowFocused,
  sessionFocused,
  elapsedMs = 0,
}: NotifyInput): boolean {
  if (windowFocused && sessionFocused) return false;
  if (reason === "permission") return true;
  if (!sessionFocused) return true;
  return elapsedMs >= SHORT_TURN_MS;
}

export function permissionEventId(request: { rpcId: unknown; sessionId?: string | null }): string {
  return `${String(request.rpcId)}:${request.sessionId ?? ""}`;
}

/** First sighting of each queued permission. Drops ids that have left the queue. */
export function freshPermissionEvents<T extends { rpcId: unknown; sessionId?: string | null }>(
  seen: Set<string>,
  queue: T[],
): T[] {
  const live = new Set(queue.map(permissionEventId));
  for (const id of [...seen]) {
    if (!live.has(id)) seen.delete(id);
  }
  const fresh: T[] = [];
  for (const request of queue) {
    const id = permissionEventId(request);
    if (seen.has(id)) continue;
    seen.add(id);
    fresh.push(request);
  }
  return fresh;
}

/** Sidebar unread: anything you were not looking at when it finished. */
export function shouldMarkUnread(windowFocused: boolean, sessionFocused: boolean): boolean {
  return !(windowFocused && sessionFocused);
}

export function isSessionFocused(
  focusedSessionId: string | null | undefined,
  eventSessionId: string | null | undefined,
): boolean {
  if (!eventSessionId) return true;
  return focusedSessionId === eventSessionId;
}

export function notifyText(
  reason: NotifyReason,
  sessionTitle: string,
  detail = "",
  locale: "zh" | "en" = "zh",
): { title: string; body: string } {
  const name = sessionTitle.trim() || t(locale, "notify.session");
  if (reason === "permission") {
    return { title: t(locale, "notify.needPerm"), body: detail ? `${name} · ${detail}` : name };
  }
  return { title: t(locale, "notify.done"), body: detail ? `${name} · ${detail}` : name };
}
