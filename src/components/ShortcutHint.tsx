import { createContext, useContext, type ReactNode } from "react";
import { useModHeld } from "../hooks/useModHeld";
import { bindingFor, formatBinding, showsModHint } from "../lib/shortcuts-table";

type ShortcutState = {
  held: boolean;
  overrides: Record<string, string>;
  mac: boolean;
};

const ShortcutCtx = createContext<ShortcutState>({
  held: false,
  overrides: {},
  mac: true,
});

function detectMac(): boolean {
  if (typeof navigator === "undefined") return true;
  return /Mac|iPhone|iPad/.test(navigator.platform || "");
}

export function ShortcutProvider({
  shortcuts,
  children,
}: {
  shortcuts: Record<string, string>;
  children: ReactNode;
}) {
  const held = useModHeld();
  return (
    <ShortcutCtx.Provider value={{ held, overrides: shortcuts, mac: detectMac() }}>
      {children}
    </ShortcutCtx.Provider>
  );
}

export function useShortcutState(): ShortcutState {
  return useContext(ShortcutCtx);
}

export function useShortcutHint(id: string): string | null {
  const { held, overrides, mac } = useShortcutState();
  const spec = bindingFor(overrides, id);
  if (!held || !spec || !showsModHint(spec)) return null;
  return formatBinding(spec, mac);
}

export function ShortcutKbd({ id }: { id: string }) {
  const hint = useShortcutHint(id);
  if (!hint) return null;
  return <kbd className="shortcut-kbd">{hint}</kbd>;
}
