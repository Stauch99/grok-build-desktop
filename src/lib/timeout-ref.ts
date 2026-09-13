/** Mutable handle so a later schedule or unmount can cancel the pending timer. */
export type TimeoutRef = { current: ReturnType<typeof setTimeout> | null };

export const TOAST_CLEAR_MS = 2800;
export const TOAST_ACTION_MS = 6000;
export const PERMISSION_FOCUS_MS = 200;

export function toastDurationMs(hasAction: boolean): number {
  return hasAction ? TOAST_ACTION_MS : TOAST_CLEAR_MS;
}

/** Leftover ms when a toast timer is paused mid-flight. */
export function remainingTimeoutMs(startedAt: number, durationMs: number, now: number): number {
  return Math.max(0, durationMs - (now - startedAt));
}

export function clearTimeoutRef(handle: TimeoutRef): void {
  if (handle.current == null) return;
  clearTimeout(handle.current);
  handle.current = null;
}

export function scheduleTimeout(handle: TimeoutRef, fn: () => void, ms: number): void {
  clearTimeoutRef(handle);
  handle.current = setTimeout(() => {
    handle.current = null;
    fn();
  }, ms);
}
