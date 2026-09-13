import { summarizeDiffs, type DiffSummaryItem } from "../lib/diff-summary";
import { useT } from "../lib/locale-context";

export type DiffSummaryProps = {
  items: DiffSummaryItem[];
  onOpen?: () => void;
};

/**
 * This-turn created / modified counts. Opens the changes rail.
 */
export function DiffSummary({ items, onOpen }: DiffSummaryProps) {
  const t = useT();
  const { created, modified } = summarizeDiffs(items);
  if (created === 0 && modified === 0) return null;

  const inner = (
    <span className="diff-summary-inner">
      <span>{t("diff.thisTurn")}</span>
      {created > 0 ? <span className="stat-add">{t("diff.createdN", { n: created })}</span> : null}
      {modified > 0 ? <span className="stat-del">{t("diff.changedN", { n: modified })}</span> : null}
    </span>
  );

  if (onOpen) {
    return (
      <button type="button" className="diff-summary-strip" onClick={onOpen} aria-label={t("diff.openChanges")}>
        {inner}
      </button>
    );
  }
  return <div className="diff-summary-strip">{inner}</div>;
}
