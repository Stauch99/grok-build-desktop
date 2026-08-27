import type { TrajectoryRow } from "../lib/trajectory";

export type TrajectoryViewProps = {
  rows: TrajectoryRow[];
  onJump?: (id: string) => void;
};

/** Read-only ACP event ledger. Not a second transcript. */
export function TrajectoryView({ rows, onJump }: TrajectoryViewProps) {
  if (rows.length === 0) return <p className="float-empty">还没有事件。</p>;
  return (
    <ol className="trajectory" aria-label="轨迹">
      {rows.map((row) => (
        <li key={row.id}>
          <button
            type="button"
            className="hub-row-main"
            onClick={() => onJump?.(row.id)}
          >
            <span className="hub-meta">{row.kind}</span>
            <strong>{row.label.slice(0, 120)}</strong>
          </button>
        </li>
      ))}
    </ol>
  );
}
