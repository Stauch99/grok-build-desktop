import { afterEach, describe, expect, it, vi } from "vitest";
import {
  PERMISSION_FOCUS_MS,
  TOAST_CLEAR_MS,
  clearTimeoutRef,
  scheduleTimeout,
  type TimeoutRef,
} from "./timeout-ref";

describe("scheduleTimeout", () => {
  afterEach(() => {
    vi.useRealTimers();
  });

  it("fires once after the delay and clears the stored id", () => {
    vi.useFakeTimers();
    const handle: TimeoutRef = { current: null };
    const fn = vi.fn();
    scheduleTimeout(handle, fn, TOAST_CLEAR_MS);
    expect(fn).not.toHaveBeenCalled();
    vi.advanceTimersByTime(TOAST_CLEAR_MS - 1);
    expect(fn).not.toHaveBeenCalled();
    vi.advanceTimersByTime(1);
    expect(fn).toHaveBeenCalledTimes(1);
    expect(handle.current).toBeNull();
  });

  it("replaces the previous timeout so only the latest callback runs", () => {
    vi.useFakeTimers();
    const handle: TimeoutRef = { current: null };
    const first = vi.fn();
    const second = vi.fn();
    scheduleTimeout(handle, first, TOAST_CLEAR_MS);
    vi.advanceTimersByTime(1000);
    scheduleTimeout(handle, second, TOAST_CLEAR_MS);
    vi.advanceTimersByTime(TOAST_CLEAR_MS);
    expect(first).not.toHaveBeenCalled();
    expect(second).toHaveBeenCalledTimes(1);
  });

  it("clearTimeoutRef prevents a pending callback from firing", () => {
    vi.useFakeTimers();
    const handle: TimeoutRef = { current: null };
    const fn = vi.fn();
    scheduleTimeout(handle, fn, PERMISSION_FOCUS_MS);
    clearTimeoutRef(handle);
    vi.advanceTimersByTime(PERMISSION_FOCUS_MS);
    expect(fn).not.toHaveBeenCalled();
    expect(handle.current).toBeNull();
  });
});

describe("toast and focus delays", () => {
  it("toast stays up for 2800ms and permission focus waits 200ms", () => {
    expect(TOAST_CLEAR_MS).toBe(2800);
    expect(PERMISSION_FOCUS_MS).toBe(200);
  });
});
