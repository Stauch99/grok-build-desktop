import { afterEach, describe, expect, it, vi } from "vitest";
import {
  BILLING_POLL_MS,
  IDLE_PRELOAD_TIMEOUT_MS,
  afterInitializeFetchSessionList,
  flagsAfterWarmup,
  scheduleIdle,
  shouldAdoptInFlightBoot,
  shouldBlockComposer,
  shouldHoldConnectingForSessionList,
  shouldStartWarmup,
  initializeTimeoutMs,
  shouldBlockIdleComposer,
} from "./agent-warmup";

describe("shouldBlockComposer", () => {
  it("blocks while connecting before initialize", () => {
    expect(shouldBlockComposer(true, false)).toBe(true);
  });

  it("blocks after first paint if initialize has not succeeded", () => {
    expect(shouldBlockComposer(false, false)).toBe(true);
  });

  it("unblocks only after initialize succeeds", () => {
    expect(shouldBlockComposer(false, true)).toBe(false);
  });

  it("stays blocked if connecting is still true", () => {
    expect(shouldBlockComposer(true, true)).toBe(true);
  });
});

describe("shouldHoldConnectingForSessionList", () => {
  it("never holds connecting for session/list after initialize", () => {
    expect(shouldHoldConnectingForSessionList()).toBe(false);
  });

  it("unblocks the composer after initialize even if list is still pending", () => {
    expect(shouldBlockComposer(shouldHoldConnectingForSessionList(), true)).toBe(false);
  });

  it("resolves the boot path without waiting for session/list", async () => {
    const hung = () => new Promise<void>(() => {});
    const raced = Promise.race([
      afterInitializeFetchSessionList(hung).then(() => "boot" as const),
      new Promise<"held">((resolve) => setTimeout(() => resolve("held"), 30)),
    ]);
    await expect(raced).resolves.toBe("boot");
  });
});

describe("billing poll", () => {
  it("is 120 seconds, not 10", () => {
    expect(BILLING_POLL_MS).toBe(120_000);
  });
});

describe("scheduleIdle", () => {
  afterEach(() => {
    vi.unstubAllGlobals();
    vi.useRealTimers();
  });

  it("uses requestIdleCallback with a 2s timeout fallback", () => {
    const ric = vi.fn(() => 7);
    vi.stubGlobal("requestIdleCallback", ric);
    const fn = vi.fn();
    scheduleIdle(fn);
    expect(ric).toHaveBeenCalledWith(fn, { timeout: IDLE_PRELOAD_TIMEOUT_MS });
    expect(IDLE_PRELOAD_TIMEOUT_MS).toBe(2000);
  });

  it("falls back to setTimeout when idle callback is missing", () => {
    vi.stubGlobal("requestIdleCallback", undefined);
    vi.useFakeTimers();
    const fn = vi.fn();
    scheduleIdle(fn);
    expect(fn).not.toHaveBeenCalled();
    vi.advanceTimersByTime(1999);
    expect(fn).not.toHaveBeenCalled();
    vi.advanceTimersByTime(1);
    expect(fn).toHaveBeenCalledTimes(1);
  });
});

describe("shouldStartWarmup", () => {
  it("starts only after listeners are attached and the effect is still live", () => {
    expect(shouldStartWarmup(true, false)).toBe(true);
  });

  it("does not start before listeners are subscribed", () => {
    expect(shouldStartWarmup(false, false)).toBe(false);
  });

  it("does not start after Strict Mode cleanup cancels the effect", () => {
    expect(shouldStartWarmup(true, true)).toBe(false);
    expect(shouldStartWarmup(false, true)).toBe(false);
  });
});

describe("shouldAdoptInFlightBoot", () => {
  it("adopts a shared boot this instance has not observed", () => {
    expect(shouldAdoptInFlightBoot(true, false)).toBe(true);
  });

  it("skips adopt when this instance is already ready", () => {
    expect(shouldAdoptInFlightBoot(true, true)).toBe(false);
  });

  it("does not adopt when no boot is in flight", () => {
    expect(shouldAdoptInFlightBoot(false, false)).toBe(false);
  });
});

describe("shouldBlockIdleComposer", () => {
  it("lets the user type on an unbound chip even if that CLI is not ready yet", () => {
    expect(shouldBlockIdleComposer(false, false, false)).toBe(false);
    expect(shouldBlockIdleComposer(true, false, false)).toBe(true);
    expect(shouldBlockIdleComposer(false, false, true)).toBe(true);
  });
});

describe("initializeTimeoutMs", () => {
  it("fails a hung CLI handshake before the generic 180s RPC timeout", () => {
    expect(initializeTimeoutMs()).toBe(20_000);
    expect(initializeTimeoutMs()).toBeLessThan(180_000);
  });
});

describe("flagsAfterWarmup", () => {
  it("marks ready and clears sawExit after initialize succeeds", () => {
    expect(flagsAfterWarmup(true)).toEqual({ ready: true, sawExit: false });
  });

  it("clears ready and sets sawExit so the restart banner is the retry path", () => {
    expect(flagsAfterWarmup(false)).toEqual({ ready: false, sawExit: true });
  });
});
