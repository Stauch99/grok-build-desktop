export type GoalBarProps = {
  goal: string;
  onClear?: () => void;
};

/** Current ACP plan item as a strip. Not a /loop scheduler. */
export function GoalBar({ goal, onClear }: GoalBarProps) {
  return (
    <div className="goal-bar" role="status" aria-label="当前目标">
      <span>目标 · {goal}</span>
      {onClear ? (
        <button type="button" className="btn ghost" onClick={onClear} aria-label="收起目标">
          收起
        </button>
      ) : null}
    </div>
  );
}
