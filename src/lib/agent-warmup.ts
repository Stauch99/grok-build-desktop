export const BILLING_POLL_MS = 120_000;
export const IDLE_PRELOAD_TIMEOUT_MS = 2000;

export function shouldBlockComposer(connecting: boolean, initialized: boolean): boolean {
  return connecting || !initialized;
}

export function scheduleIdle(fn: () => void, timeoutMs = IDLE_PRELOAD_TIMEOUT_MS): () => void {
  const ric = globalThis.requestIdleCallback;
  if (typeof ric === "function") {
    const id = ric(fn, { timeout: timeoutMs });
    return () => globalThis.cancelIdleCallback(id);
  }
  const timer = globalThis.setTimeout(fn, timeoutMs);
  return () => globalThis.clearTimeout(timer);
}
