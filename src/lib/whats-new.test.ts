import { describe, expect, it } from "vitest";
import {
  WHATS_NEW_KEY,
  markWhatsNewSeen,
  shouldShowWhatsNew,
  whatsNewSeenVersion,
} from "./whats-new";

function fakeStore(initial: Record<string, string> = {}) {
  const map = new Map(Object.entries(initial));
  return {
    get: (k: string) => map.get(k) ?? null,
    set: (k: string, v: string) => void map.set(k, v),
    map,
  };
}

describe("whats-new seen version", () => {
  it("shows on first launch, on a version bump, and not once seen", () => {
    expect(shouldShowWhatsNew("0.6.5", null)).toBe(true);
    expect(shouldShowWhatsNew("0.6.6", "0.6.5")).toBe(true);
    expect(shouldShowWhatsNew("0.6.5", "0.6.5")).toBe(false);
  });

  it("never shows for an empty running version", () => {
    expect(shouldShowWhatsNew("", null)).toBe(false);
    expect(shouldShowWhatsNew("  ", "0.1.0")).toBe(false);
  });

  it("round-trips the seen marker through storage", () => {
    const store = fakeStore();
    expect(whatsNewSeenVersion(store.get)).toBeNull();
    markWhatsNewSeen("0.6.5", store.set);
    expect(store.map.get(WHATS_NEW_KEY)).toBe("0.6.5");
    expect(whatsNewSeenVersion(store.get)).toBe("0.6.5");
    expect(shouldShowWhatsNew("0.6.5", whatsNewSeenVersion(store.get))).toBe(false);
  });

  it("ignores blank stored values and refuses to record an empty version", () => {
    const store = fakeStore({ [WHATS_NEW_KEY]: "   " });
    expect(whatsNewSeenVersion(store.get)).toBeNull();
    markWhatsNewSeen("", store.set);
    expect(store.map.size).toBe(1);
  });
});
