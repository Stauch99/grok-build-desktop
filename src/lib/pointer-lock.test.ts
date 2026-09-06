import { describe, expect, it } from "vitest";
import { hoverMovesHighlight, pointerSourceFromMove } from "./pointer-lock";

describe("palette highlight source", () => {
  it("ignores hover while the last input was a key", () => {
    expect(hoverMovesHighlight("keyboard")).toBe(false);
    expect(hoverMovesHighlight("pointer")).toBe(true);
  });

  it("unlocks only on a real mouse move", () => {
    expect(pointerSourceFromMove({ movementX: 0, movementY: 0 })).toBeNull();
    expect(pointerSourceFromMove({ movementX: 1, movementY: 0 })).toBe("pointer");
  });
});
