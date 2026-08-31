import { describe, expect, it, vi } from "vitest";
import { MOTION_MS, motionMs, prefersReducedMotion } from "./motion";

describe("motionMs", () => {
  it("uses the CSS duration when matchMedia is missing", () => {
    expect(motionMs()).toBe(MOTION_MS);
    expect(prefersReducedMotion()).toBe(false);
  });

  it("drops to zero when the user prefers reduced motion", () => {
    const matchMedia = vi.fn().mockReturnValue({ matches: true });
    vi.stubGlobal("window", { matchMedia });
    expect(prefersReducedMotion()).toBe(true);
    expect(motionMs()).toBe(0);
    vi.unstubAllGlobals();
  });
});
