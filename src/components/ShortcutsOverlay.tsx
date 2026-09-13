import { useEffect, useRef } from "react";
import { trapFocus } from "../lib/trap-focus";
import { useT } from "../lib/locale-context";
import { bindingFor, DEFAULT_SHORTCUTS, formatBinding } from "../lib/shortcuts-table";
import { useShortcutState } from "./ShortcutHint";
import { IconGrokClose } from "../grok-icons";

export type ShortcutsOverlayProps = {
  onClose: () => void;
  leaving?: boolean;
};

type Row = { label: string; keys: string[] };

/**
 * ⌘/ cheatsheet: every window-level shortcut from the (rebindable) table plus
 * the fixed chords and composer keys. Palette-styled; Traps Tab and returns
 * focus on close like CommandPalette.
 */
export function ShortcutsOverlay({ onClose, leaving = false }: ShortcutsOverlayProps) {
  const t = useT();
  const { overrides, mac } = useShortcutState();
  const layerRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const prev = document.activeElement instanceof HTMLElement ? document.activeElement : null;
    layerRef.current?.querySelector<HTMLElement>("button")?.focus();
    return () => {
      if (prev?.isConnected) prev.focus();
    };
  }, []);

  // Escape works even if focus slipped out of the dialog — capture so pane
  // handlers never see it while the sheet is up.
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key !== "Escape") return;
      e.preventDefault();
      e.stopPropagation();
      onClose();
    };
    window.addEventListener("keydown", onKey, true);
    return () => window.removeEventListener("keydown", onKey, true);
  }, [onClose]);

  const fmt = (spec: string) => formatBinding(spec, mac);

  const globalRows: Row[] = [
    ...DEFAULT_SHORTCUTS.map((row) => ({
      label: t(row.action),
      keys: [fmt(bindingFor(overrides, row.id))],
    })),
    { label: t("shortcut.cheat"), keys: [fmt("Mod+/"), "?"] },
    { label: t("shortcut.zen"), keys: [fmt("Mod+.")] },
    { label: t("shortcut.fontUp"), keys: [fmt("Mod+=")] },
    { label: t("shortcut.fontDown"), keys: [fmt("Mod+-")] },
    { label: t("shortcut.fontReset"), keys: [fmt("Mod+0")] },
  ];

  const composerRows: Row[] = [
    { label: t("shortcuts.send"), keys: ["↩"] },
    { label: t("shortcuts.newline"), keys: [mac ? "⇧↩" : "Shift+Enter"] },
    { label: t("shortcuts.history"), keys: ["↑"] },
    { label: t("shortcuts.tab"), keys: ["Tab"] },
    { label: t("shortcuts.stop"), keys: [fmt("Escape")] },
  ];

  return (
    <div
      ref={layerRef}
      className={`palette-layer${leaving ? " layer-out" : ""}`}
      role="dialog"
      aria-modal="true"
      aria-label={t("shortcuts.title")}
      onKeyDown={(e) => {
        if (e.key === "Tab" && layerRef.current) trapFocus(layerRef.current, e.nativeEvent);
      }}
    >
      <div className="palette-backdrop" onClick={onClose} />
      <div className="palette shortcuts-card">
        <div className="shortcuts-head">
          <span className="palette-group">{t("shortcuts.title")}</span>
          <button type="button" className="icon-btn" aria-label={t("common.close")} onClick={onClose}>
            <IconGrokClose size={16} />
          </button>
        </div>
        <div className="shortcuts-body">
          <div className="palette-group">{t("shortcuts.group.global")}</div>
          {globalRows.map((row) => (
            <div key={row.label} className="shortcuts-row">
              <span className="shortcuts-label">{row.label}</span>
              <span className="shortcuts-keys">
                {row.keys.map((k) => (
                  <kbd key={k}>{k}</kbd>
                ))}
              </span>
            </div>
          ))}
          <div className="palette-group">{t("shortcuts.group.composer")}</div>
          {composerRows.map((row) => (
            <div key={row.label} className="shortcuts-row">
              <span className="shortcuts-label">{row.label}</span>
              <span className="shortcuts-keys">
                {row.keys.map((k) => (
                  <kbd key={k}>{k}</kbd>
                ))}
              </span>
            </div>
          ))}
        </div>
        <div className="palette-foot">
          <kbd>{fmt("Escape")}</kbd> {t("palette.hint")}
        </div>
      </div>
    </div>
  );
}
