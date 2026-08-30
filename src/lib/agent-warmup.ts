export const BILLING_POLL_MS = 120_000;
export const IDLE_PRELOAD_TIMEOUT_MS = 2000;

/** initialize must fail faster than the generic 180s RPC timeout so chip pick is honest. */
export function initializeTimeoutMs(): number {
  return 20_000;
}

export function shouldBlockComposer(connecting: boolean, initialized: boolean): boolean {
  return connecting || !initialized;
}

/** Unbound 新对话: allow type/send so first send can boot the selected CLI. */
export function shouldBlockIdleComposer(
  connecting: boolean,
  initialized: boolean,
  hasOpenSession: boolean,
): boolean {
  if (!hasOpenSession) return connecting;
  return shouldBlockComposer(connecting, initialized);
}

/** session/list is best-effort catalog. It must not keep `connecting` after initialize. */
export function shouldHoldConnectingForSessionList(): boolean {
  return false;
}

/**
 * After initialize succeeds, start session/list without holding the boot promise.
 * Await the fetch only if connecting is allowed to stay held for list (never).
 */
export function afterInitializeFetchSessionList(
  fetchList: () => Promise<unknown>,
): Promise<void> {
  if (shouldHoldConnectingForSessionList()) {
    return fetchList().then(() => undefined);
  }
  void fetchList();
  return Promise.resolve();
}

/** Warmup may start only after ACP listeners are subscribed and the effect is still live. */
export function shouldStartWarmup(listenersAttached: boolean, cancelled: boolean): boolean {
  return listenersAttached && !cancelled;
}

/** A shared in-flight boot must be awaited and adopted by this instance, not returned unobserved. */
export function shouldAdoptInFlightBoot(bootInFlight: boolean, alreadyReady: boolean): boolean {
  return bootInFlight && !alreadyReady;
}

export function flagsAfterWarmup(ok: boolean): { ready: boolean; sawExit: boolean } {
  return { ready: ok, sawExit: !ok };
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
