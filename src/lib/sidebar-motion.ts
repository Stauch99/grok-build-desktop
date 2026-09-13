import { SIDEBAR_RAIL } from "./shell-ia";
import { motionMs } from "./motion";
import { useEffect, useRef, useState } from "react";

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

const easeOut = (k: number) => 1 - Math.pow(1 - k, 3);

/**
 * Sidebar collapse/expand choreography.
 *
 * Collapse: content fades at full width (`hiding`), then `slotCollapsed`
 * flips and the column width tweens down to the rail.
 * Expand: the rail drops immediately and the width tweens back while the
 * content's opacity transition re-fades it in.
 *
 * `slotPx` is rAF-interpolated so the grid column never jumps; resizer
 * drags still follow instantly because `moving` is only set by the
 * collapse/expand gesture, not by `expanded` changes.
 */
export function useSidebarMotion(collapsed: boolean, expanded: number) {
  const [slotCollapsed, setSlotCollapsed] = useState(collapsed);
  const [slotPx, setSlotPx] = useState(collapsed ? SIDEBAR_RAIL : expanded);
  const [moving, setMoving] = useState(false);
  const slotPxRef = useRef(slotPx);
  slotPxRef.current = slotPx;
  const expandedRef = useRef(expanded);
  expandedRef.current = expanded;

  // Instant follow for resizer drags and external width changes — only when
  // no gesture is running.
  useEffect(() => {
    if (moving) return;
    const target = slotCollapsed ? SIDEBAR_RAIL : expanded;
    if (slotPx !== target) setSlotPx(target);
  }, [expanded, slotCollapsed, moving, slotPx]);

  // Intent change → schedule the slot flip (collapse fades content first).
  useEffect(() => {
    if (collapsed === slotCollapsed) return;
    const ms = motionMs();
    if (ms === 0) {
      setSlotCollapsed(collapsed);
      return;
    }
    setMoving(true);
    if (!collapsed) {
      setSlotCollapsed(false);
      return;
    }
    const id = window.setTimeout(() => setSlotCollapsed(true), ms);
    return () => window.clearTimeout(id);
    // slotPx intentionally excluded — the tween effect owns width animation.
  }, [collapsed, slotCollapsed]);

  // Slot flip → tween the column width.
  useEffect(() => {
    const target = slotCollapsed ? SIDEBAR_RAIL : expandedRef.current;
    const from = slotPxRef.current;
    const ms = motionMs();
    if (from === target || ms === 0) {
      if (from !== target) setSlotPx(target);
      setMoving(false);
      return;
    }
    let raf = 0;
    const t0 = performance.now();
    const tick = (t: number) => {
      const k = Math.min(1, (t - t0) / ms);
      setSlotPx(Math.round(from + (target - from) * easeOut(k)));
      if (k < 1) raf = requestAnimationFrame(tick);
      else setMoving(false);
    };
    raf = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(raf);
  }, [slotCollapsed]);

  const view = sidebarMotionView({ collapsed, slotCollapsed });
  return { ...view, slotPx, moving };
}
