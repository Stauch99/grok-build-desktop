import { describe, expect, it } from "vitest";
import { armConfirm, isArmed, tapDanger, dangerCaption } from "./confirm";

describe("double-confirm", () => {
  it("arms then confirms within 3s", () => {
    const first = tapDanger(null, "rm:fs", 1000);
    expect(first.confirmed).toBe(false);
    expect(isArmed(first.next, "rm:fs", 2500)).toBe(true);
    const second = tapDanger(first.next, "rm:fs", 3500);
    expect(second.confirmed).toBe(true);
  });

  it("expires after the window", () => {
    const armed = armConfirm("rm:fs", 1000);
    expect(isArmed(armed, "rm:fs", 4001)).toBe(false);
    expect(tapDanger(armed, "rm:fs", 5000).confirmed).toBe(false);
  });

  it("does not confirm a different id", () => {
    const armed = armConfirm("rm:fs", 1000);
    expect(tapDanger(armed, "rm:other", 1500).confirmed).toBe(false);
  });

  it("swaps the button caption while armed", () => {
    expect(dangerCaption(null, "rm:fs", "删除 foo", "再点一次以删除 foo", 1000)).toBe("删除 foo");
    const armed = armConfirm("rm:fs", 1000);
    expect(dangerCaption(armed, "rm:fs", "删除 foo", "再点一次以删除 foo", 1500)).toBe("再点一次以删除 foo");
  });
});
