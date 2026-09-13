import { useEffect, useState } from "react";
import {
  sameSelectionState,
  shouldPublishSelectionToolbar,
  type Rect,
} from "../lib/selection-actions";

export interface TextSelectionState {
  text: string;
  rect: Rect;
}

function snapshot(): TextSelectionState | null {
  const sel = document.getSelection();
  if (!sel || sel.isCollapsed || sel.rangeCount === 0) return null;
  const anchor = sel.anchorNode instanceof Element ? sel.anchorNode : sel.anchorNode?.parentElement;
  const focus = sel.focusNode instanceof Element ? sel.focusNode : sel.focusNode?.parentElement;
  if (!anchor || !focus) return null;
  const inMsg = (el: Element) =>
    !!el.closest(".msg, .turn-user, .fold, .tool-result, .compact-card");
  if (!inMsg(anchor) || !inMsg(focus)) return null;
  const text = sel.toString().trim();
  if (!text) return null;
  const r = sel.getRangeAt(0).getBoundingClientRect();
  if (r.width === 0 && r.height === 0) return null;
  return { text, rect: { top: r.top, left: r.left, width: r.width, height: r.height } };
}

/** Watches document selection; surfaces non-collapsed selections fully inside an assistant message. */
export function useTextSelection(): TextSelectionState | null {
  const [state, setState] = useState<TextSelectionState | null>(null);

  useEffect(() => {
    let pointerDown = false;
    let last: TextSelectionState | null = null;

    function publish() {
      const next = snapshot();
      if (sameSelectionState(last, next)) return;
      last = next;
      setState(next);
    }

    function onPointerDown(e: PointerEvent) {
      if (e.button !== 0) return;
      const target = e.target;
      if (target instanceof Element && target.closest(".sel-toolbar")) return;
      pointerDown = true;
      if (last) {
        last = null;
        setState(null);
      }
    }

    function onPointerUp() {
      if (!pointerDown) return;
      pointerDown = false;
      if (shouldPublishSelectionToolbar({ pointerDown })) publish();
    }

    function onSelectionChange() {
      if (!shouldPublishSelectionToolbar({ pointerDown })) return;
      publish();
    }

    function onKey(e: KeyboardEvent) {
      if (e.key === "Escape") {
        last = null;
        setState(null);
      }
    }

    function onScroll() {
      last = null;
      setState(null);
    }

    document.addEventListener("pointerdown", onPointerDown, true);
    document.addEventListener("pointerup", onPointerUp, true);
    document.addEventListener("pointercancel", onPointerUp, true);
    document.addEventListener("selectionchange", onSelectionChange);
    document.addEventListener("scroll", onScroll, true);
    document.addEventListener("keydown", onKey);
    return () => {
      document.removeEventListener("pointerdown", onPointerDown, true);
      document.removeEventListener("pointerup", onPointerUp, true);
      document.removeEventListener("pointercancel", onPointerUp, true);
      document.removeEventListener("selectionchange", onSelectionChange);
      document.removeEventListener("scroll", onScroll, true);
      document.removeEventListener("keydown", onKey);
    };
  }, []);

  return state;
}
