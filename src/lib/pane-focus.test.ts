import { describe, expect, it } from "vitest";
import { shouldMoveComposerFocus } from "./pane-focus";

describe("shouldMoveComposerFocus", () => {
  it("does not steal the composer when the pane is already focused", () => {
    expect(shouldMoveComposerFocus("main", "main")).toBe(false);
  });

  it("moves the composer when focusing a different pane", () => {
    expect(shouldMoveComposerFocus("main", "p2")).toBe(true);
  });
});
