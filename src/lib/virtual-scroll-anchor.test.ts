import { describe, expect, it } from "vitest";
import {
  latestThreadRowIndex,
  readyTranscriptPinKey,
  restoreVirtualScrollIndex,
  shouldPinReadyTranscript,
} from "./virtual-scroll-anchor";

describe("restoreVirtualScrollIndex", () => {
  it("returns the saved index only when virtualization flips", () => {
    expect(restoreVirtualScrollIndex(false, false, 12)).toBeNull();
    expect(restoreVirtualScrollIndex(true, true, 12)).toBeNull();
    expect(restoreVirtualScrollIndex(false, true, 12)).toBe(12);
    expect(restoreVirtualScrollIndex(true, false, 0)).toBe(0);
  });

  it("does not restore a top-of-thread anchor when pinning to the latest row", () => {
    expect(restoreVirtualScrollIndex(false, true, 0, true)).toBeNull();
    expect(restoreVirtualScrollIndex(false, true, 12, true)).toBeNull();
    expect(restoreVirtualScrollIndex(true, false, 0, true)).toBeNull();
  });
});

describe("latestThreadRowIndex", () => {
  it("points at the last row so opening a thread lands on the newest reply", () => {
    expect(latestThreadRowIndex(0)).toBeNull();
    expect(latestThreadRowIndex(-1)).toBeNull();
    expect(latestThreadRowIndex(1)).toBe(0);
    expect(latestThreadRowIndex(81)).toBe(80);
  });
});

describe("readyTranscriptPinKey", () => {
  it("waits until the new session is loaded so the previous thread is not pinned", () => {
    expect(readyTranscriptPinKey({ sessionId: "a", loading: true, lastItemId: "old" })).toBeNull();
    expect(readyTranscriptPinKey({ sessionId: "a", loading: false, lastItemId: undefined })).toBeNull();
    expect(readyTranscriptPinKey({ sessionId: null, loading: false, lastItemId: "n1" })).toBeNull();
    expect(readyTranscriptPinKey({ sessionId: "a", loading: false, lastItemId: "n1" })).toBe("a");
  });
});

describe("shouldPinReadyTranscript", () => {
  it("re-pins after a loading gap even when the session id is unchanged", () => {
    expect(shouldPinReadyTranscript("a", null)).toEqual({ pin: false, remember: null });
    expect(shouldPinReadyTranscript(null, "a")).toEqual({ pin: true, remember: "a" });
    expect(shouldPinReadyTranscript("a", "a")).toEqual({ pin: false, remember: "a" });
    expect(shouldPinReadyTranscript("a", "b")).toEqual({ pin: true, remember: "b" });
  });
});
