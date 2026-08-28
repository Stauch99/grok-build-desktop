import { afterEach, describe, expect, it, vi } from "vitest";
import {
  BILLING_POLL_MS,
  IDLE_PRELOAD_TIMEOUT_MS,
  scheduleIdle,
  shouldBlockComposer,
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
