import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { SEARCH_HIT_MS, applySearchHit, waitForSelector } from "./search-hit";

function fakeHit() {
  const classes = new Set<string>();
  return {
    classList: {
      add: (c: string) => {
        classes.add(c);
      },
      remove: (c: string) => {
        classes.delete(c);
      },
      contains: (c: string) => classes.has(c),
    },
  };
}

describe("applySearchHit", () => {
  afterEach(() => {
    vi.useRealTimers();
  });

  it("adds search-hit to the matching turn and removes it after 2.4s", () => {
    vi.useFakeTimers();
    const hit = fakeHit();
    const root = {
      querySelector: vi.fn().mockReturnValue(hit),
    };
    applySearchHit(root as unknown as ParentNode, "main-u2");
    expect(root.querySelector).toHaveBeenCalledWith("#turn-main-u2, #msg-main-u2");
    expect(hit.classList.contains("search-hit")).toBe(true);
    vi.advanceTimersByTime(SEARCH_HIT_MS - 1);
    expect(hit.classList.contains("search-hit")).toBe(true);
    vi.advanceTimersByTime(1);
    expect(hit.classList.contains("search-hit")).toBe(false);
  });

  it("does not remove the class if the caller clears the timer", () => {
    vi.useFakeTimers();
    const hit = fakeHit();
    const root = { querySelector: vi.fn().mockReturnValue(hit) };
    const clear = applySearchHit(root as unknown as ParentNode, "main-u2");
    clear();
    vi.advanceTimersByTime(SEARCH_HIT_MS);
    expect(hit.classList.contains("search-hit")).toBe(true);
  });

  it("is a no-op when the row is missing", () => {
    vi.useFakeTimers();
    const root = { querySelector: vi.fn().mockReturnValue(null) };
    const clear = applySearchHit(root as unknown as ParentNode, "missing");
    vi.advanceTimersByTime(SEARCH_HIT_MS);
    clear();
  });
});

describe("waitForSelector", () => {
  beforeEach(() => {
    vi.stubGlobal("requestAnimationFrame", (cb: FrameRequestCallback) =>
      setTimeout(() => cb(Date.now()), 16),
    );
  });

  afterEach(() => {
    vi.useRealTimers();
    vi.unstubAllGlobals();
  });

  it("resolves immediately when the node exists", async () => {
    const hit = fakeHit();
    const root = { querySelector: vi.fn().mockReturnValue(hit) };
    await expect(waitForSelector(root as unknown as ParentNode, "#turn-x", 500)).resolves.toBe(hit);
    expect(root.querySelector).toHaveBeenCalledTimes(1);
    expect(root.querySelector).toHaveBeenCalledWith("#turn-x");
  });

  it("resolves after the node appears on a later frame", async () => {
    vi.useFakeTimers();
    const hit = fakeHit();
    const root = {
      querySelector: vi.fn().mockReturnValueOnce(null).mockReturnValueOnce(null).mockReturnValue(hit),
    };
    const pending = waitForSelector(root as unknown as ParentNode, "#turn-x", 500);
    await vi.advanceTimersByTimeAsync(32);
    await expect(pending).resolves.toBe(hit);
  });

  it("resolves null after timeout", async () => {
    vi.useFakeTimers();
    const root = { querySelector: vi.fn().mockReturnValue(null) };
    const pending = waitForSelector(root as unknown as ParentNode, "#turn-x", 500);
    await vi.advanceTimersByTimeAsync(500);
    await expect(pending).resolves.toBeNull();
  });
});
