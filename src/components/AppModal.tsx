import { useEffect, useRef } from "react";
import { useT } from "../lib/locale-context";
import { usePresence } from "../lib/motion";

export type AppModalProps = {
  open: boolean;
  title: string;
  body: string;
  confirmLabel: string;
  onConfirm: () => void;
  onCancel: () => void;
};

/**
 * Theme-matched confirm dialog. Replaces window.confirm so the main thread
 * is not blocked and the chrome stays on palette-layer styles.
 */
export function AppModal({ open, title, body, confirmLabel, onConfirm, onCancel }: AppModalProps) {
  const t = useT();
  const confirmRef = useRef<HTMLButtonElement>(null);
  const { shown, leaving } = usePresence(open);

  useEffect(() => {
    if (!shown) return;
    confirmRef.current?.focus();
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") {
        e.preventDefault();
        onCancel();
      }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [shown, onCancel]);

  if (!shown) return null;

  return (
    <div className={`palette-layer${leaving ? " layer-out" : ""}`} role="presentation">
      <div className="palette-backdrop" onClick={onCancel} />
      <div className="palette" role="dialog" aria-modal="true" aria-labelledby="app-modal-title">
        <div className="palette-group" id="app-modal-title">
          {title}
        </div>
        <p className="hint rewind-summary">{body}</p>
        <div className="set-actions rewind-actions">
          <button type="button" className="btn" onClick={onCancel}>
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
