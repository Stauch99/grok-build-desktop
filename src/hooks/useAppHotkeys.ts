import { useEffect, useRef } from "react";
import { matchAppShortcut, type AppHotkeyId } from "../lib/app-hotkeys";
import { recordLocalEvent } from "../lib/telemetry";

export type AppHotkeyHandlers = Record<AppHotkeyId, () => void>;

export function useAppHotkeys(opts: {
  shortcuts: Record<string, string>;
  overlayOpen: boolean;
  canClosePane: boolean;
  telemetry?: boolean;
  handlers: AppHotkeyHandlers;
}): void {
  const handlersRef = useRef(opts.handlers);
  handlersRef.current = opts.handlers;
  const telemetry = opts.telemetry ?? false;

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.defaultPrevented) return;
      const id = matchAppShortcut(e, opts.shortcuts, {
        overlayOpen: opts.overlayOpen,
        canClosePane: opts.canClosePane,
      });
      if (!id) return;
      e.preventDefault();
      handlersRef.current[id]();
      recordLocalEvent(telemetry, `hotkey.${id}`);
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [opts.shortcuts, opts.overlayOpen, opts.canClosePane, telemetry]);
}
