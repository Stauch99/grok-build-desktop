import { useMemo, useState } from "react";
import { diffLines, rowMark } from "../lib/diff";
import { basename } from "../lib/text";

export type DiffViewProps = {
  path: string;
  oldText?: string | null;
  newText?: string;
  /** Reveal the file in Finder / the default editor. */
  onOpen?: (path: string) => void;
};

/**
 * Line-level diff for a tool call's file edit.
 *
 * Increase and decrease carry a `+` / `−` glyph as well as a background tint,
 * so the diff stays readable without color. Untouched stretches collapse to a
 * clickable row rather than scrolling the interesting part off screen.
 */
export function DiffView({ path, oldText, newText, onOpen }: DiffViewProps) {
  const [expanded, setExpanded] = useState(false);
  const result = useMemo(
    () => diffLines(oldText, newText ?? "", { context: expanded ? 999 : 3 }),
    [oldText, newText, expanded],
  );

  const created = oldText === null || oldText === undefined;

  return (
    <div className="diff">
      <div className="diff-head">
        <span className="diff-path" title={path}>
          {basename(path) || path}
        </span>
        <span className="diff-stat">
          {result.added > 0 && <span className="stat-add">+{result.added}</span>}
          {result.removed > 0 && <span className="stat-del">−{result.removed}</span>}
          {created && <span className="diff-tag">新建</span>}
        </span>
        <span className="diff-actions">
          {result.rows.some((r) => r.kind === "gap") || expanded ? (
            <button
              type="button"
              className="file-open"
              onClick={() => setExpanded((v) => !v)}
              aria-expanded={expanded}
            >
              {expanded ? "折叠" : "全文"}
            </button>
          ) : null}
          <button
            type="button"
            className="file-open"
            title="复制新内容"
            aria-label="复制新内容"
            onClick={() => void navigator.clipboard.writeText(newText ?? "")}
          >
            复制
          </button>
          {onOpen && path ? (
            <button
              type="button"
              className="file-open"
              title="在访达中打开"
              aria-label="在访达中打开"
              onClick={() => onOpen(path)}
            >
              访达
            </button>
          ) : null}
        </span>
      </div>

      <div className="diff-body">
        {result.rows.map((row, i) => {
          if (row.kind === "gap") {
            return (
              <button
                key={`gap-${i}`}
                type="button"
                className="diff-gap"
                onClick={() => setExpanded(true)}
              >
                ⋯ {row.count} 行未改动
              </button>
            );
          }
          return (
            <div className={`diff-row ${row.kind}`} key={`${row.kind}-${i}`}>
              <span className="diff-ln old">{row.kind === "add" ? "" : row.oldLine}</span>
              <span className="diff-ln new">{row.kind === "del" ? "" : row.newLine}</span>
              <span className="diff-mark" aria-hidden>
                {rowMark(row.kind)}
              </span>
              <span className="diff-text">{row.text || " "}</span>
            </div>
          );
        })}
        {result.truncated && (
          <div className="diff-more">改动过大，只显示前 {result.rows.length} 行</div>
        )}
      </div>
    </div>
  );
}
