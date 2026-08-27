import type { GitChange } from "../api";
import { statusMark, totalChanges } from "../lib/git";

export type ChangesPanelProps = {
  changes: GitChange[];
  /** Null when the folder is not a git repo. */
  isRepo: boolean;
  onPreview: (abs: string) => void;
  onReveal: (abs: string) => void;
  onRefresh: () => void;
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
}: ChangesPanelProps) {
  if (!isRepo) {
    return <p className="float-empty">当前目录不是 git 仓库</p>;
  }

  const totals = totalChanges(changes);

  return (
    <div className="changes">
      <div className="changes-head">
        <span className="changes-total">
          {totals.files === 0 ? (
            "工作区干净"
          ) : (
            <>
              {totals.files} 个文件
              <span className="stat-add"> +{totals.added}</span>
              <span className="stat-del"> −{totals.removed}</span>
            </>
          )}
        </span>
        <button type="button" className="file-open" onClick={onRefresh} title="重新读取">
          刷新
        </button>
      </div>

      {changes.length > 0 && (
        <div className="file-list">
          {changes.map((c) => (
            <div className="change-row" key={c.abs || c.path}>
              <span className={`change-mark ${c.status}`} title={c.status}>
                {statusMark(c.status)}
              </span>
              <button
                type="button"
                className="file-item"
                title={c.path}
                onClick={() => onPreview(c.abs)}
              >
                {c.path}
              </button>
              <span className="change-stat">
                {c.added > 0 && <span className="stat-add">+{c.added}</span>}
                {c.removed > 0 && <span className="stat-del">−{c.removed}</span>}
              </span>
              <button
                type="button"
                className="file-open"
                title="在访达中打开"
                onClick={() => onReveal(c.abs)}
              >
                访达
              </button>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
