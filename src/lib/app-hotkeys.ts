import { bindingFor, matchBinding } from "./shortcuts-table";

/** Window-level actions. Mode cycling stays on the composer (Shift+Tab). */
export const APP_HOTKEYS = [
  "palette",
  "new-chat",
  "settings",
  "hub",
  "focus-composer",
  "review",
  "close-pane",
  "cancel",
] as const;

export type AppHotkeyId = (typeof APP_HOTKEYS)[number];

export type HotkeyEvent = {
  key: string;
  metaKey: boolean;
  ctrlKey: boolean;
  shiftKey: boolean;
  repeat?: boolean;
};

export function matchAppShortcut(
  e: HotkeyEvent,
  overrides: Record<string, string>,
  opts: { overlayOpen?: boolean; canClosePane?: boolean } = {},
): AppHotkeyId | null {
  if (e.repeat) return null;
  for (const id of APP_HOTKEYS) {
    const spec = bindingFor(overrides, id);
    if (!spec || !matchBinding(spec, e)) continue;
    if (id === "cancel" && opts.overlayOpen) return null;
    if (id === "close-pane" && !opts.canClosePane) continue;
    return id;
  }
  return null;
}

export function modHeldFromEvent(
  _held: boolean,
  e: { type: "keydown" | "keyup" | "blur"; metaKey: boolean; ctrlKey: boolean },
): boolean {
  if (e.type === "blur") return false;
  return e.metaKey || e.ctrlKey;
}