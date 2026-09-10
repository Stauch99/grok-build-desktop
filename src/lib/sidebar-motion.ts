import { SIDEBAR_RAIL } from "./shell-ia";
import { motionMs } from "./motion";
import { useEffect, useState } from "react";

export type SidebarMotionInput = {
  collapsed: boolean;
  slotCollapsed: boolean;
};

export type SidebarMotionView = {
  slotCollapsed: boolean;
  contentHidden: boolean;
  motion: boolean;
};

/** Layout width follows the slot; content fades before the slot shrinks. */
export function sidebarMotionView({ collapsed, slotCollapsed }: SidebarMotionInput): SidebarMotionView {
  if (collapsed) {
    return {
      slotCollapsed,
      contentHidden: true,
      motion: !slotCollapsed,
    };
  }
  return {
    slotCollapsed: false,
    contentHidden: false,
    motion: slotCollapsed,
  };
}

export function sidebarSlotPx(slotCollapsed: boolean, expanded: number): number {
  return slotCollapsed ? SIDEBAR_RAIL : expanded;
}

export function useSidebarMotion(collapsed: boolean): SidebarMotionView {
  const [slotCollapsed, setSlotCollapsed] = useState(collapsed);

  useEffect(() => {
    if (!collapsed) {
      setSlotCollapsed(false);
      return;
    }
    if (slotCollapsed) return;
    const ms = motionMs();
    if (ms === 0) {
      setSlotCollapsed(true);
      return;
    }
    const id = window.setTimeout(() => setSlotCollapsed(true), ms);
    return () => window.clearTimeout(id);
  }, [collapsed, slotCollapsed]);

  return sidebarMotionView({ collapsed, slotCollapsed });
}
