import { useEffect, useState } from "react";
import {
  describePlan,
  REWIND_CONFIRM_PLACEHOLDER,
  REWIND_SKIP_NOTE,
  rewindPhraseConfirmed,
  rewindSkipReason,
  type RevertPlan,
  type RevertPreviewRow,
} from "../lib/checkpoint";
import { rewindHint } from "../lib/rewind-unify";
import { DiffView } from "./DiffView";

export type RewindDialogProps = {
  open: boolean;
  plan: RevertPlan;
  rows: RevertPreviewRow[];
  onConfirm: () => void;
  onCancel: () => void;
};

/**
 * Preview file rewinds before restore_text_file runs. Replaces window.confirm.
 * Parent owns the plan, disk writes, and when this dialog is shown.
 */
export function RewindDialog({ open, plan, rows, onConfirm, onCancel }: RewindDialogProps) {
  const [phrase, setPhrase] = useState("");
  const canConfirm = rewindPhraseConfirmed(phrase);

  useEffect(() => {
    if (!open) {
      setPhrase("");
      return;
    }
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
      <div className="palette rewind-dialog" role="dialog" aria-modal="true" aria-label="还原到这里">
        <div className="palette-group">还原到这里</div>
        <p className="rewind-summary">{describePlan(plan)}</p>
        <p className="hint">{rewindHint("files")}</p>

        <div className="palette-list">
          {rows.map((row) => {
            const skip = rewindSkipReason(row);
            return (
              <div key={row.path} className="rewind-row">
                {skip ? (
                  <p className="rewind-skip-note rewind-delete-note">
                    {row.path} {REWIND_SKIP_NOTE}
                  </p>
                ) : (
                  <>
                    {row.kind === "delete" ? (
                      <p className="rewind-delete-note">将删除 {row.path}</p>
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
                <li key={label}>无法还原：{label}</li>
              ))}
            </ul>
          )}
        </div>

        <input
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
            取消
          </button>
          <button type="button" className="btn primary" onClick={onConfirm} disabled={!canConfirm}>
            还原这些文件
          </button>
        </div>
      </div>
    </div>
  );
}
