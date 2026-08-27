import { useEffect } from "react";
import { digitFromEvent, isMod, isMruSwitch } from "../lib/shortcuts";

export type SessionHotkeysOptions = {
  enabled: boolean;
  sessionIds: string[];
  /** 0–8 for ⌘/Ctrl+1–9 */
  onOpenIndex: (i: number) => void;
  /** Ctrl+Tab */
  onMru: () => void;
};

function isEditableTarget(target: EventTarget | null): boolean {
  if (!(target instanceof HTMLElement)) return false;
  const tag = target.tagName;
  if (tag === "TEXTAREA" || tag === "INPUT" || tag === "SELECT") return true;
  if (target.isContentEditable) return true;
  return false;
}

export function useSessionHotkeys({
  enabled,
  sessionIds,
  onOpenIndex,
  onMru,
}: SessionHotkeysOptions): void {
  useEffect(() => {
    if (!enabled) return;

    const onKeyDown = (e: KeyboardEvent) => {
      // ⌘/Ctrl chords are not text input, so they must still fire while the
      // composer has focus — which is where the caret almost always is.
      if (!isMod(e) && isEditableTarget(e.target)) return;

      if (isMruSwitch(e)) {
        e.preventDefault();
        onMru();
        return;
      }

      const digit = digitFromEvent(e);
      if (digit === null || !isMod(e)) return;
      const index = digit - 1;
      if (index < 0 || index > 8) return;
      if (index >= sessionIds.length) return;
      e.preventDefault();
      onOpenIndex(index);
    };

    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  }, [enabled, sessionIds, onOpenIndex, onMru]);
}
