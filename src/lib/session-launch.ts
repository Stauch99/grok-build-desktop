/**
 * "Reopen last session on launch" plumbing. Both keys live in localStorage —
 * per-window chrome prefs, like `grok.zen` — because the pane layout already
 * restores which sessions were open; this only records which one had focus.
 */
import { storageGet, storageSet } from "./sidebar-local";

export const REOPEN_LAST_KEY = "grok.reopenLastSession";
export const LAST_FOCUSED_SESSION_KEY = "grok.lastFocusedSession";

/** True when the launch-time restore toggle is on. */
export function reopenLastSessionEnabled(): boolean {
  return storageGet(REOPEN_LAST_KEY) === "1";
}

export function setReopenLastSessionEnabled(enabled: boolean): void {
  storageSet(REOPEN_LAST_KEY, enabled ? "1" : "0");
}

/** The session that last held focus, or "" when none was recorded. */
export function loadLastSessionId(): string {
  return storageGet(LAST_FOCUSED_SESSION_KEY) ?? "";
}

/**
 * Persist the focused session id. Null/empty never overwrites — "last session"
 * means the last real one, so closing every pane still reopens the previous.
 */
export function saveLastSessionId(id: string | null | undefined): void {
  if (!id) return;
  storageSet(LAST_FOCUSED_SESSION_KEY, id);
}
