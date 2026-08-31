import { describe, expect, it } from "vitest";
import { matchAppShortcut, modHeldFromEvent } from "./app-hotkeys";

const chord = (key: string, extra: { shiftKey?: boolean; repeat?: boolean } = {}) => ({
  key,
  metaKey: true,
  ctrlKey: false,
  shiftKey: extra.shiftKey ?? false,
  repeat: extra.repeat ?? false,
});

describe("matchAppShortcut", () => {
  it("maps default chords to actions", () => {
    expect(matchAppShortcut(chord("k"), {})).toBe("palette");
    expect(matchAppShortcut(chord("n"), {})).toBe("new-chat");
    expect(matchAppShortcut(chord(","), {})).toBe("settings");
    expect(matchAppShortcut(chord("l"), {})).toBe("hub");
    expect(matchAppShortcut(chord("j"), {})).toBe("focus-composer");
    expect(matchAppShortcut(chord("."), {})).toBe("review");
    expect(matchAppShortcut(chord("w"), {}, { canClosePane: true })).toBe("close-pane");
    expect(matchAppShortcut(chord("w"), {}, { canClosePane: false })).toBeNull();
  });

  it("honors overrides", () => {
    expect(matchAppShortcut(chord("p"), { palette: "Mod+P" })).toBe("palette");
    expect(matchAppShortcut(chord("k"), { palette: "Mod+P" })).toBeNull();
  });

  it("leaves mode cycling to the composer", () => {
    expect(
      matchAppShortcut(
        { key: "Tab", metaKey: false, ctrlKey: false, shiftKey: true, repeat: false },
        {},
      ),
    ).toBeNull();
  });

  it("skips cancel while an overlay is open, still allows chords", () => {
    const esc = { key: "Escape", metaKey: false, ctrlKey: false, shiftKey: false, repeat: false };
    expect(matchAppShortcut(esc, {})).toBe("cancel");
    expect(matchAppShortcut(esc, {}, { overlayOpen: true })).toBeNull();
    expect(matchAppShortcut(chord("k"), {}, { overlayOpen: true })).toBe("palette");
  });

  it("ignores key repeat so new-chat does not fire in a burst", () => {
    expect(matchAppShortcut(chord("n", { repeat: true }), {})).toBeNull();
  });
});

describe("modHeldFromEvent", () => {
  it("tracks modifier down, up, and blur", () => {
    expect(modHeldFromEvent(false, { type: "keydown", metaKey: true, ctrlKey: false })).toBe(true);
    expect(modHeldFromEvent(true, { type: "keyup", metaKey: false, ctrlKey: false })).toBe(false);
    expect(modHeldFromEvent(true, { type: "blur", metaKey: true, ctrlKey: false })).toBe(false);
  });
});
