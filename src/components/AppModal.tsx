import { useEffect, useRef } from "react";

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
  const confirmRef = useRef<HTMLButtonElement>(null);

  useEffect(() => {
    if (!open) return;
    confirmRef.current?.focus();
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") {
        e.preventDefault();
        onCancel();
      }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [open, onCancel]);

  if (!open) return null;

  return (
    <div className="palette-layer" role="presentation">
      <div className="palette-backdrop" onClick={onCancel} />
      <div className="palette" role="dialog" aria-modal="true" aria-labelledby="app-modal-title">
        <div className="palette-group" id="app-modal-title">
          {title}
        </div>
        <p className="hint rewind-summary">{body}</p>
        <div className="set-actions rewind-actions">
          <button type="button" className="btn" onClick={onCancel}>
            取消
          </button>
          <button type="button" className="btn primary" ref={confirmRef} onClick={onConfirm}>
            {confirmLabel}
          </button>
        </div>
      </div>
    </div>
  );
}
