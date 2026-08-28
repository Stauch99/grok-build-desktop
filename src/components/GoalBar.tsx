import { IconClose } from "../icons";

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
        <button type="button" className="icon-btn" onClick={onClear} title="收起目标" aria-label="收起目标">
          <IconClose size={16} />
        </button>
      ) : null}
    </div>
  );
}
