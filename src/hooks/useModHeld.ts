import { useEffect, useState } from "react";
import { modHeldFromEvent } from "../lib/app-hotkeys";

/** True while ⌘ or Ctrl is held. Clears on window blur. */
export function useModHeld(): boolean {
  const [held, setHeld] = useState(false);

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      setHeld((prev) =>
        modHeldFromEvent(prev, {
          type: e.type === "keyup" ? "keyup" : "keydown",
          metaKey: e.metaKey,
          ctrlKey: e.ctrlKey,
        }),
      );
    };
    const onBlur = () => setHeld(false);
    window.addEventListener("keydown", onKey);
    window.addEventListener("keyup", onKey);
    window.addEventListener("blur", onBlur);
    return () => {
      window.removeEventListener("keydown", onKey);
      window.removeEventListener("keyup", onKey);
      window.removeEventListener("blur", onBlur);
    };
  }, []);

  return held;
}
