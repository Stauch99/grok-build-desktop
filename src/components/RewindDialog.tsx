import { useEffect, useRef, useState } from "react";
import {
  describePlan,
  filterPlan,
  REWIND_CONFIRM_PLACEHOLDER,
  REWIND_SKIP_NOTE,
  rewindPhraseConfirmed,
  rewindSkipReason,
  type RevertPlan,
  type RevertPreviewRow,
} from "../lib/checkpoint";
import { rewindHint } from "../lib/rewind-unify";
import { trapFocus } from "../lib/trap-focus";
import { DiffView } from "./DiffView";
import { useT } from "../lib/locale-context";

export type RewindDialogProps = {
  open: boolean;
  plan: RevertPlan;
  rows: RevertPreviewRow[];
  /** Receives the paths the user left checked; skipped rows are excluded. */
  onConfirm: (paths: string[]) => void;
  onCancel: () => void;
};

/**
 * Preview file rewinds before restore_text_file runs. Replaces window.confirm.
 * Parent owns the plan, disk writes, and when this dialog is shown.
 * Each row has a checkbox (all checked by default); rows that would be skipped
 * anyway stay checked and disabled.
 */
export function RewindDialog({ open, plan, rows, onConfirm, onCancel }: RewindDialogProps) {
  const t = useT();
  const [phrase, setPhrase] = useState("");
  const [checked, setChecked] = useState<ReadonlySet<string>>(new Set());
  const layerRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLInputElement>(null);
  const previousActive = useRef<HTMLElement | null>(null);
  const canConfirm = rewindPhraseConfirmed(phrase);
  const selectedPlan = filterPlan(plan, checked);

  useEffect(() => {
    if (!open) {
      setPhrase("");
      setChecked(new Set());
      return;
    }
    previousActive.current =
      document.activeElement instanceof HTMLElement ? document.activeElement : null;
    setChecked(new Set(rows.map((row) => row.path)));
    inputRef.current?.focus();
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
      if (prev?.isConnected) prev.focus();
    };
    // rows are derived from the same rewindTarget as `open`; re-seeding on a
    // mid-open items change would silently drop the user's unchecking.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open, onCancel]);

  if (!open) return null;

  const toggle = (path: string) =>
    setChecked((prev) => {
      const next = new Set(prev);
      if (next.has(path)) next.delete(path);
      else next.add(path);
      return next;
    });

  return (
    <div
      ref={layerRef}
      className="palette-layer"
      role="presentation"
      onKeyDown={(e) => {
        if (e.key === "Tab" && layerRef.current) trapFocus(layerRef.current, e.nativeEvent);
      }}
    >
      <div className="palette-backdrop" onClick={onCancel} />
      <div className="palette rewind-dialog" role="dialog" aria-modal="true" aria-label={t("rewind.title")}>
        <div className="palette-group">{t("rewind.title")}</div>
        <p className="rewind-summary">{describePlan(selectedPlan)}</p>
        <p className="hint">{rewindHint("files")}</p>

        <div className="palette-list">
          {rows.map((row) => {
            const skip = rewindSkipReason(row);
            return (
              <div key={row.path} className="rewind-row">
                <label className="rewind-check">
                  <input
                    type="checkbox"
                    checked={skip ? true : checked.has(row.path)}
                    disabled={!!skip}
                    onChange={() => toggle(row.path)}
                  />
                  <span className="rewind-check-path">{row.path}</span>
                  {skip ? <span className="rewind-check-skip">{REWIND_SKIP_NOTE}</span> : null}
                </label>
                {skip ? null : (
                  <>
                    {row.kind === "delete" ? (
                      <p className="rewind-delete-note">{t("rewind.deleteNote", { path: row.path })}</p>
                    ) : null}
                    <DiffView
                      path={row.path}
                      oldText={row.current}
                      newText={row.kind === "delete" ? "" : row.restored}
                    />
                  </>
                )}
              </div>
            );
          })}
          {plan.unknown.length > 0 && (
            <ul className="rewind-unknown">
              {plan.unknown.map((label) => (
                <li key={label}>{t("rewind.fail", { label })}</li>
              ))}
            </ul>
          )}
        </div>

        <input
          ref={inputRef}
          type="text"
          className="palette-input"
          placeholder={REWIND_CONFIRM_PLACEHOLDER}
          value={phrase}
          onChange={(e) => setPhrase(e.target.value)}
          autoComplete="off"
          spellCheck={false}
          aria-label={REWIND_CONFIRM_PLACEHOLDER}
        />
        <div className="set-actions rewind-actions">
          <button type="button" className="btn" onClick={onCancel}>
            {t("composer.cancel")}
          </button>
          <button
            type="button"
            className="btn primary"
            onClick={() => onConfirm(rows.filter((row) => checked.has(row.path)).map((row) => row.path))}
            disabled={!canConfirm}
          >
            {t("rewind.confirm")}
          </button>
        </div>
      </div>
    </div>
  );
}
