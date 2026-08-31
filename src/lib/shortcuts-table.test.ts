import { describe, expect, it } from "vitest";
import {
  DEFAULT_SHORTCUTS,
  bindingFor,
  formatBinding,
  matchBinding,
  parseBinding,
  showsModHint,
} from "./shortcuts-table";

describe("shortcuts table", () => {
  it("prefers overrides", () => {
    expect(bindingFor({ palette: "Mod+P" }, "palette")).toBe("Mod+P");
    expect(bindingFor({}, "palette")).toBe("Mod+K");
  });

  it("matches a binding", () => {
    expect(parseBinding("Mod+L")).toEqual({ mod: true, shift: false, key: "l" });
    expect(matchBinding("Mod+L", { key: "l", metaKey: true, ctrlKey: false, shiftKey: false })).toBe(true);
    expect(matchBinding("Mod+L", { key: "l", metaKey: false, ctrlKey: false, shiftKey: false })).toBe(false);
  });

  it("includes close-pane as Mod+W", () => {
    expect(DEFAULT_SHORTCUTS.find((r) => r.id === "close-pane")).toEqual({
      id: "close-pane",
      action: "关闭窗格",
      defaultBinding: "Mod+W",
    });
  });

  it("includes review as Mod+.", () => {
    expect(DEFAULT_SHORTCUTS.find((r) => r.id === "review")).toEqual({
      id: "review",
      action: "Dashboard",
      defaultBinding: "Mod+.",
    });
    expect(matchBinding("Mod+.", { key: ".", metaKey: true, ctrlKey: false, shiftKey: false })).toBe(true);
    expect(matchBinding("Mod+,", { key: ",", metaKey: true, ctrlKey: false, shiftKey: false })).toBe(true);
  });

  it("formats chords for the hint overlay", () => {
    expect(formatBinding("Mod+K", true)).toBe("⌘K");
    expect(formatBinding("Mod+K", false)).toBe("Ctrl+K");
    expect(formatBinding("Mod+.", true)).toBe("⌘.");
    expect(formatBinding("Mod+,", true)).toBe("⌘,");
    expect(formatBinding("Shift+Tab", true)).toBe("⇧Tab");
    expect(formatBinding("Escape", true)).toBe("Esc");
  });

  it("only hints bindings that use the modifier key", () => {
    expect(showsModHint("Mod+N")).toBe(true);
    expect(showsModHint("Escape")).toBe(false);
    expect(showsModHint("Shift+Tab")).toBe(false);
  });
});
