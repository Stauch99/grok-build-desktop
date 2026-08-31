/** Mutable handle so a later schedule or unmount can cancel the pending timer. */
export type TimeoutRef = { current: ReturnType<typeof setTimeout> | null };

export const TOAST_CLEAR_MS = 2800;
export const PERMISSION_FOCUS_MS = 200;

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
