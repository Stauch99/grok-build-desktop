import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import {
  buildPaletteItems,
  parsePaletteAction,
  type PaletteAction,
  type PaletteItem,
  type PaletteSources,
} from "../lib/palette";

export type CommandPaletteState = {
  open: boolean;
  setOpen: React.Dispatch<React.SetStateAction<boolean>>;
  items: PaletteItem[];
  run: (id: string) => void;
};

export function useCommandPalette(opts: {
  sources: PaletteSources;
  onAction: (action: PaletteAction) => void;
}): CommandPaletteState {
  const [open, setOpen] = useState(false);
  const onActionRef = useRef(opts.onAction);
  onActionRef.current = opts.onAction;

  const items = useMemo(
    () => buildPaletteItems(opts.sources),
    [opts.sources.sessions, opts.sources.projects, opts.sources.commands, opts.sources.titles, opts.sources.cwd, opts.sources.isRepo],
  );

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key.toLowerCase() !== "k" || !(e.metaKey || e.ctrlKey)) return;
      e.preventDefault();
      setOpen((o) => !o);
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, []);

  const run = useCallback((id: string) => {
    setOpen(false);
    const action = parsePaletteAction(id);
    if (action) onActionRef.current(action);
  }, []);

  return { open, setOpen, items, run };
}
