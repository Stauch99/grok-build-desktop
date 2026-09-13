import { useEffect, useRef, useState } from "react";
import { useT } from "../lib/locale-context";
import { usePresence } from "../lib/motion";
import { NOTE_MAX_CHARS } from "../lib/session-notes";
import { trapFocus } from "../lib/trap-focus";

export type SessionNoteModalProps = {
  open: boolean;
  /** Existing note text, read once on open — the textarea owns its state after that. */
  note: string;
  onSave: (text: string) => void;
  onClose: () => void;
};

/**
 * Small scratch-note editor for a session, styled on the palette layer like
 * AppModal: backdrop click and Escape close, Tab is trapped, and focus returns
 * to whatever held it before the dialog opened.
 */
export function SessionNoteModal({ open, note, onSave, onClose }: SessionNoteModalProps) {
  const t = useT();
  const [text, setText] = useState(note);
  const layerRef = useRef<HTMLDivElement>(null);
  const textRef = useRef<HTMLTextAreaElement>(null);
  const previousActive = useRef<HTMLElement | null>(null);
  const { shown, leaving } = usePresence(open);

  useEffect(() => {
    if (!shown) return;
    previousActive.current =
      document.activeElement instanceof HTMLElement ? document.activeElement : null;
    const area = textRef.current;
    if (area) {
      area.focus();
      area.setSelectionRange(area.value.length, area.value.length);
    }
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") {
        e.preventDefault();
        onClose();
      }
    };
    window.addEventListener("keydown", onKey);
    return () => {
      window.removeEventListener("keydown", onKey);
      const prev = previousActive.current;
      previousActive.current = null;
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
  }, [shown, onClose]);

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
      <div className="palette-backdrop" onClick={onClose} />
      <div className="palette note-modal" role="dialog" aria-modal="true" aria-label={t("note.title")}>
        <div className="palette-group">{t("note.title")}</div>
        <textarea
          ref={textRef}
          className="note-text"
          value={text}
          maxLength={NOTE_MAX_CHARS}
          placeholder={t("note.placeholder")}
          aria-label={t("note.title")}
          spellCheck={false}
          onChange={(e) => setText(e.target.value)}
        />
        <div className="set-actions rewind-actions">
          <button type="button" className="btn" onClick={onClose}>
            {t("composer.cancel")}
          </button>
          <button
            type="button"
            className="btn primary"
            onClick={() => onSave(text.trim())}
          >
            {t("preview.save")}
          </button>
        </div>
      </div>
    </div>
  );
}
