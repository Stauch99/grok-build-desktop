import { summarizeDiffs, type DiffSummaryItem } from "../lib/diff-summary";

export type DiffSummaryProps = {
  items: DiffSummaryItem[];
  onOpen?: () => void;
};

/**
 * This-turn created / modified counts. Opens the changes rail.
 */
export function DiffSummary({ items, onOpen }: DiffSummaryProps) {
  const { created, modified } = summarizeDiffs(items);
  if (created === 0 && modified === 0) return null;

  const inner = (
    <>
      <span>本轮</span>
      {created > 0 ? <span className="stat-add">新建 {created}</span> : null}
      {modified > 0 ? <span className="stat-del">改动 {modified}</span> : null}
    </>
  );

  if (onOpen) {
    return (
      <button type="button" className="diff-summary-strip" onClick={onOpen} aria-label="打开本次改动">
        {inner}
      </button>
    );
  }
  return <div className="diff-summary-strip">{inner}</div>;
}
