import { useEffect, useState } from "react";
import type { Rect } from "../lib/selection-actions";

export interface TextSelectionState {
  text: string;
  rect: Rect;
}

/** Watches document selection; surfaces non-collapsed selections fully inside an assistant message. */
export function useTextSelection(): TextSelectionState | null {
  const [state, setState] = useState<TextSelectionState | null>(null);

  useEffect(() => {
    function read() {
      const sel = document.getSelection();
      if (!sel || sel.isCollapsed || sel.rangeCount === 0) {
        setState(null);
        return;
      }
      const anchor = sel.anchorNode instanceof Element ? sel.anchorNode : sel.anchorNode?.parentElement;
      const focus = sel.focusNode instanceof Element ? sel.focusNode : sel.focusNode?.parentElement;
      if (!anchor?.closest(".msg.assistant") || !focus?.closest(".msg.assistant")) {
        setState(null);
        return;
      }
      const text = sel.toString().trim();
      if (!text) {
        setState(null);
        return;
      }
      const r = sel.getRangeAt(0).getBoundingClientRect();
      if (r.width === 0 && r.height === 0) {
        setState(null);
        return;
      }
      setState({ text, rect: { top: r.top, left: r.left, width: r.width, height: r.height } });
    }

    function clear() {
      setState(null);
    }
    function onKey(e: KeyboardEvent) {
      if (e.key === "Escape") clear();
    }

    document.addEventListener("selectionchange", read);
    document.addEventListener("scroll", clear, true);
    document.addEventListener("keydown", onKey);
    return () => {
      document.removeEventListener("selectionchange", read);
      document.removeEventListener("scroll", clear, true);
      document.removeEventListener("keydown", onKey);
    };
  }, []);

  return state;
}
