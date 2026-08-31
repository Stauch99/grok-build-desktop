import type { GitChange } from "../api";
import { canDiscardChange, changePreviewTarget, discardConfirm, statusMark, totalChanges } from "../lib/git";
import { fileListEntry } from "../lib/file-row";
import { IconRefresh } from "../icons";
import { FileListRow } from "./FileListRow";
import { useT } from "../lib/locale-context";

export type ChangesPanelProps = {
  changes: GitChange[];
  /** Null when the folder is not a git repo. */
  isRepo: boolean;
  onPreview: (abs: string) => void;
  onReveal: (abs: string) => void;
  onRefresh: () => void;
  onDiscard?: (path: string) => void;
};

/**
 * Working-tree review list: every file the agent (or you) changed since HEAD,
 * with per-file line counts. This is the "what actually changed" surface —
 * the thread's tool cards only show one edit at a time.
 */
export function ChangesPanel({
  changes,
  isRepo,
  onPreview,
  onReveal,
  onRefresh,
  onDiscard,
}: ChangesPanelProps) {
  const t = useT();
  if (!isRepo) {
    return <p className="float-empty">{t("git.notRepo")}</p>;
  }

  const totals = totalChanges(changes);

  return (
    <div className="changes">
      <div className="changes-head">
        <span className="changes-total">
          {totals.files === 0 ? (
            t("git.clean")
          ) : (
            <>
              {t("git.files", { n: totals.files })}
              <span className="stat-add"> +{totals.added}</span>
              <span className="stat-del"> −{totals.removed}</span>
            </>
          )}
        </span>
        <button type="button" className="file-open" onClick={onRefresh} title={t("git.refresh")} aria-label={t("git.refresh")}>
          <IconRefresh size={14} />
        </button>
      </div>

      {changes.length > 0 && (
        <div className="file-list">
          {changes.map((c) => {
            const target = changePreviewTarget(c);
            const discardable = !!onDiscard && canDiscardChange(c.status);
            const { name, crumb } = fileListEntry(c.path);
            const revealAt = c.abs || c.path;
            return (
              <FileListRow
                key={c.abs || c.path}
                name={name}
                crumb={crumb}
                path={c.path}
                onOpen={() => onPreview(target)}
                onReveal={() => onReveal(revealAt)}
                leading={
                  <span className={`change-mark ${c.status}`} title={c.status}>
                    {statusMark(c.status)}
                  </span>
                }
                trailing={
                  <>
                    <span className="change-stat">
                      {c.added > 0 && <span className="stat-add">+{c.added}</span>}
                      {c.removed > 0 && <span className="stat-del">−{c.removed}</span>}
                    </span>
                    {discardable ? (
                      <button
                        type="button"
                        className="file-open change-discard"
                        title={t("git.discardHint")}
                        aria-label={t("git.discardPath", { path: c.path })}
                        onClick={() => {
                          if (!window.confirm(discardConfirm(c.path))) return;
                          onDiscard(c.path);
                        }}
                      >
                        {t("git.discard")}
                      </button>
                    ) : null}
                  </>
                }
              />
            );
          })}
        </div>
      )}
    </div>
  );
}
