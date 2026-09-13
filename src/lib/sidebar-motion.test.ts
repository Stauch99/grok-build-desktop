import { describe, expect, it } from "vitest";
import { SIDEBAR_RAIL } from "./shell-ia";
import { sidebarMotionView, sidebarSlotPx } from "./sidebar-motion";

describe("sidebarMotionView", () => {
  it("hides content immediately when collapsing, then shrinks the slot", () => {
    expect(sidebarMotionView({ collapsed: true, slotCollapsed: false })).toEqual({
      slotCollapsed: false,
      contentHidden: true,
      motion: true,
    });
  });

  it("grows the slot immediately when expanding", () => {
    expect(sidebarMotionView({ collapsed: false, slotCollapsed: true })).toEqual({
      slotCollapsed: false,
      contentHidden: false,
      motion: true,
    });
  });

  it("matches collapsed and expanded idle states", () => {
    expect(sidebarMotionView({ collapsed: true, slotCollapsed: true }).contentHidden).toBe(true);
    expect(sidebarMotionView({ collapsed: false, slotCollapsed: false }).contentHidden).toBe(false);
  });
});

describe("sidebarSlotPx", () => {
  it("uses the rail when the slot has collapsed", () => {
    expect(sidebarSlotPx(true, 248)).toBe(SIDEBAR_RAIL);
    expect(sidebarSlotPx(false, 248)).toBe(248);
  });
});
