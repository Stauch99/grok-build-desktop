import { useCallback, useMemo, useRef, useState } from "react";
import type { Locale } from "../lib/i18n";
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
  locale?: Locale;
}): CommandPaletteState {
  const [open, setOpen] = useState(false);
  const onActionRef = useRef(opts.onAction);
  onActionRef.current = opts.onAction;
  const locale = opts.locale ?? "zh";

  const items = useMemo(
    () => buildPaletteItems(opts.sources, locale),
    [opts.sources.sessions, opts.sources.projects, opts.sources.commands, opts.sources.titles, opts.sources.cwd, opts.sources.isRepo, locale],
  );

  const run = useCallback((id: string) => {
    setOpen(false);
    const action = parsePaletteAction(id);
    if (action) onActionRef.current(action);
  }, []);

  return { open, setOpen, items, run };
}
