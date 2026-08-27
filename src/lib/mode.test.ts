import { describe, expect, it } from "vitest";
import { MODE_OPTIONS, modeLabel, modeNeedsConfirm, nextMode, slashForMode, type Mode } from "./mode";

describe("mode helpers", () => {
  it("labels never say Auto", () => {
    const modes: Mode[] = ["agent", "plan", "yolo"];
    for (const mode of modes) {
      expect(modeLabel(mode)).not.toMatch(/auto/i);
    }
    expect(MODE_OPTIONS.every((o) => !/auto/i.test(o.label))).toBe(true);
  });

  it("maps slashes without a /yolo command", () => {
    expect(slashForMode("agent")).toBe("/auto");
    expect(slashForMode("plan")).toBe("/plan");
    expect(slashForMode("yolo")).toBe("/always-approve");
  });

  it("cycles Agent → Plan → 始终批准 → Agent", () => {
    expect(nextMode("agent")).toBe("plan");
    expect(nextMode("plan")).toBe("yolo");
    expect(nextMode("yolo")).toBe("agent");
  });

  it("asks before switching into 始终批准", () => {
    expect(modeNeedsConfirm("agent", "yolo")).toBe(true);
    expect(modeNeedsConfirm("plan", "yolo")).toBe(true);
    expect(modeNeedsConfirm("yolo", "yolo")).toBe(false);
    expect(modeNeedsConfirm("yolo", "agent")).toBe(false);
    expect(modeNeedsConfirm("agent", "plan")).toBe(false);
  });
});
