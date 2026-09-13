import { describe, expect, it } from "vitest";
import { parseThemePref, resolveTheme, togglePinnedTheme } from "./theme-pref";

describe("resolveTheme", () => {
  it("pins light and dark", () => {
    expect(resolveTheme("light", true)).toBe("light");
    expect(resolveTheme("dark", false)).toBe("dark");
  });

  it("follows the system when asked", () => {
    expect(resolveTheme("system", true)).toBe("dark");
    expect(resolveTheme("system", false)).toBe("light");
  });
});

describe("parseThemePref", () => {
  it("accepts light, dark, and system", () => {
    expect(parseThemePref("light")).toBe("light");
    expect(parseThemePref("dark")).toBe("dark");
    expect(parseThemePref("system")).toBe("system");
  });

  it("rejects unknown values", () => {
    expect(parseThemePref("auto")).toBeNull();
    expect(parseThemePref(undefined)).toBeNull();
  });
});

describe("togglePinnedTheme", () => {
  it("leaves system and pins the opposite of what is on screen", () => {
    expect(togglePinnedTheme("system", "light")).toBe("dark");
    expect(togglePinnedTheme("system", "dark")).toBe("light");
    expect(togglePinnedTheme("light", "light")).toBe("dark");
    expect(togglePinnedTheme("dark", "dark")).toBe("light");
  });
});
