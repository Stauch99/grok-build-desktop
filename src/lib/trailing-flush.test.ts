import { afterEach, describe, expect, it, vi } from "vitest";
import { DRAFT_PERSIST_MS, createTrailingFlush } from "./trailing-flush";

describe("createTrailingFlush", () => {
  afterEach(() => {
    vi.useRealTimers();
  });

  it("emits only the latest value once, on the trailing edge", () => {
    vi.useFakeTimers();
    const emit = vi.fn();
    const t = createTrailingFlush<string>(emit, DRAFT_PERSIST_MS);
    t.push("a");
    t.push("ab");
    t.push("abc");
    expect(emit).not.toHaveBeenCalled();
    vi.advanceTimersByTime(DRAFT_PERSIST_MS - 1);
    expect(emit).not.toHaveBeenCalled();
    vi.advanceTimersByTime(1);
    expect(emit).toHaveBeenCalledTimes(1);
    expect(emit).toHaveBeenLastCalledWith("abc");
  });

  it("rearms the timer on each push", () => {
    vi.useFakeTimers();
    const emit = vi.fn();
    const t = createTrailingFlush<string>(emit, DRAFT_PERSIST_MS);
    t.push("a");
    vi.advanceTimersByTime(DRAFT_PERSIST_MS - 10);
    t.push("ab");
    vi.advanceTimersByTime(DRAFT_PERSIST_MS - 1);
    expect(emit).not.toHaveBeenCalled();
    vi.advanceTimersByTime(1);
    expect(emit).toHaveBeenCalledTimes(1);
  });

  it("flush emits the pending value immediately and is idempotent", () => {
    vi.useFakeTimers();
    const emit = vi.fn();
    const t = createTrailingFlush<string>(emit, DRAFT_PERSIST_MS);
    t.flush();
    expect(emit).not.toHaveBeenCalled();
    t.push("a");
    t.flush();
    expect(emit).toHaveBeenCalledTimes(1);
    expect(emit).toHaveBeenLastCalledWith("a");
    t.flush();
    vi.advanceTimersByTime(DRAFT_PERSIST_MS * 2);
    expect(emit).toHaveBeenCalledTimes(1);
  });

  it("pushNow supersedes a stale pending value instead of flushing it later", () => {
    vi.useFakeTimers();
    const emit = vi.fn();
    const t = createTrailingFlush<Record<string, string>>(emit, DRAFT_PERSIST_MS);
    t.push({ s1: "typed" });
    t.pushNow({ s1: "" });
    expect(emit).toHaveBeenCalledTimes(1);
    expect(emit).toHaveBeenLastCalledWith({ s1: "" });
    vi.advanceTimersByTime(DRAFT_PERSIST_MS * 2);
    expect(emit).toHaveBeenCalledTimes(1);
  });
});
