import { useEffect, useRef } from "react";
import { useT } from "../lib/locale-context";
import { usePresence } from "../lib/motion";
import { trapFocus } from "../lib/trap-focus";

export type AppModalProps = {
  open: boolean;
  title: string;
  body: string;
  confirmLabel: string;
  /** Destructive confirms focus Cancel on open so Enter cannot trigger them. */
  danger?: boolean;
  onConfirm: () => void;
  onCancel: () => void;
};

/**
 * Theme-matched confirm dialog. Replaces window.confirm so the main thread
 * is not blocked and the chrome stays on palette-layer styles.
 */
export function AppModal({ open, title, body, confirmLabel, danger, onConfirm, onCancel }: AppModalProps) {
  const t = useT();
  const confirmRef = useRef<HTMLButtonElement>(null);
  const cancelRef = useRef<HTMLButtonElement>(null);
  const layerRef = useRef<HTMLDivElement>(null);
  const previousActive = useRef<HTMLElement | null>(null);
  const { shown, leaving } = usePresence(open);

  useEffect(() => {
    if (!shown) return;
    previousActive.current =
      document.activeElement instanceof HTMLElement ? document.activeElement : null;
    (danger ? cancelRef : confirmRef).current?.focus();
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") {
        e.preventDefault();
        onCancel();
      }
    };
    window.addEventListener("keydown", onKey);
    return () => {
      window.removeEventListener("keydown", onKey);
      const prev = previousActive.current;
      previousActive.current = null;
      // Give focus back to whatever was focused before the modal opened.
      const active = document.activeElement;
      const inside = !!(
        layerRef.current &&
        active instanceof Node &&
        layerRef.current.contains(active)
      );
      if ((inside || active === document.body || active == null) && prev?.isConnected) {
        prev.focus();
      }
    };
  }, [shown, danger, onCancel]);

  if (!shown) return null;

  return (
    <div
      ref={layerRef}
      className={`palette-layer${leaving ? " layer-out" : ""}`}
      role="presentation"
      onKeyDown={(e) => {
        if (e.key === "Tab" && layerRef.current) trapFocus(layerRef.current, e.nativeEvent);
      }}
    >
      <div className="palette-backdrop" onClick={onCancel} />
      <div className="palette" role="dialog" aria-modal="true" aria-labelledby="app-modal-title">
        <div className="palette-group" id="app-modal-title">
          {title}
        </div>
        <p className="hint rewind-summary">{body}</p>
        <div className="set-actions rewind-actions">
          <button type="button" className="btn" ref={cancelRef} onClick={onCancel}>
            {t("composer.cancel")}
          </button>
          <button type="button" className="btn primary" ref={confirmRef} onClick={onConfirm}>
            {confirmLabel}
          </button>
        </div>
      </div>
    </div>
  );
}
