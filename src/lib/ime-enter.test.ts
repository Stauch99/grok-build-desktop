import { describe, expect, it } from "vitest";
import {
  applyImeComposition,
  emptyImeEnterState,
  IME_ENTER_GRACE_MS,
  imeBlocksEnter,
} from "./ime-enter";

describe("imeBlocksEnter", () => {
  const idle = emptyImeEnterState();

  it("lets a normal Enter send when the IME is idle", () => {
    expect(imeBlocksEnter({ key: "Enter", isComposing: false, keyCode: 13 }, idle, 1000)).toBe(false);
  });

  it("blocks Enter while the IME is composing a candidate", () => {
    expect(imeBlocksEnter({ key: "Enter", isComposing: true, keyCode: 13 }, idle, 1000)).toBe(true);
  });

  it("blocks the Windows/IME composition key (229)", () => {
    expect(imeBlocksEnter({ key: "Enter", isComposing: false, keyCode: 229 }, idle, 1000)).toBe(true);
    expect(imeBlocksEnter({ key: "Process", isComposing: false }, idle, 1000)).toBe(true);
  });

  it("blocks Enter that confirms composition even after compositionend", () => {
    const composing = applyImeComposition(idle, "start", 1000);
    expect(imeBlocksEnter({ key: "Enter", isComposing: false, keyCode: 13 }, composing, 1001)).toBe(true);
    const justEnded = applyImeComposition(composing, "end", 1100);
    expect(imeBlocksEnter({ key: "Enter", isComposing: false, keyCode: 13 }, justEnded, 1100)).toBe(true);
    expect(
      imeBlocksEnter(
        { key: "Enter", isComposing: false, keyCode: 13 },
        justEnded,
        1100 + IME_ENTER_GRACE_MS - 1,
      ),
    ).toBe(true);
    expect(
      imeBlocksEnter(
        { key: "Enter", isComposing: false, keyCode: 13 },
        justEnded,
        1100 + IME_ENTER_GRACE_MS,
      ),
    ).toBe(false);
  });
});
