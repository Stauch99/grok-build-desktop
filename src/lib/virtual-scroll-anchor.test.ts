import { describe, expect, it } from "vitest";
import { restoreVirtualScrollIndex } from "./virtual-scroll-anchor";

describe("restoreVirtualScrollIndex", () => {
  it("returns the saved index only when virtualization flips", () => {
    expect(restoreVirtualScrollIndex(false, false, 12)).toBeNull();
    expect(restoreVirtualScrollIndex(true, true, 12)).toBeNull();
    expect(restoreVirtualScrollIndex(false, true, 12)).toBe(12);
    expect(restoreVirtualScrollIndex(true, false, 0)).toBe(0);
  });
});
