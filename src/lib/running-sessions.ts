/** In-flight ACP turns for this window. Not unique: several sessions can run at once. */

export function addRunningId(ids: readonly string[], id: string | null | undefined): string[] {
  if (!id) return [...ids];
  return ids.includes(id) ? [...ids] : [...ids, id];
}

export function removeRunningId(ids: readonly string[], id: string | null | undefined): string[] {
  if (!id) return [...ids];
  return ids.filter((item) => item !== id);
}

export function displayedIsRunning(sessionId: string | null | undefined, runningIds: readonly string[]): boolean {
  return !!sessionId && runningIds.includes(sessionId);
}

export function settledSessionIds(prev: readonly string[], next: readonly string[]): string[] {
  const live = new Set(next);
  return prev.filter((id) => !live.has(id));
}

export function shouldAbandonInFlightOnSend(opts: {
  pendingSessionId: string | null | undefined;
  sendingSessionId: string | null | undefined;
}): boolean {
  return !!opts.pendingSessionId && opts.pendingSessionId === opts.sendingSessionId;
}

/** Composer/chrome busy follows the open session, plus the gap before a session id exists. */
export function syncDisplayedBusy(opts: {
  displayedId: string | null | undefined;
  runningIds: readonly string[];
  catchUpBusy?: boolean;
}): boolean {
  if (displayedIsRunning(opts.displayedId, opts.runningIds)) return true;
  if (opts.catchUpBusy && !opts.displayedId && opts.runningIds.length === 0) return true;
  if (opts.catchUpBusy && opts.displayedId && opts.runningIds.length === 0) return true;
  return false;
}
