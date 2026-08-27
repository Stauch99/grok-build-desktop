import { useId, useState } from "react";

export type PlanCompleteCardProps = {
  title?: string;
  onApprove: () => void;
  onReject: () => void;
  onFeedback: (text: string) => void;
};

/**
 * Plan 完成：批准执行 / 拒绝 / 反馈.
 */
export function PlanCompleteCard({
  title = "计划完成",
  onApprove,
  onReject,
  onFeedback,
}: PlanCompleteCardProps) {
  const [text, setText] = useState("");
  const id = useId();

  return (
    <section className="permission">
      <h4>{title}</h4>
      <p className="permission-hint">计划写完了。批准后执行，或写下要改的地方。</p>
      <div className="set-stack">
        <label htmlFor={id}>反馈</label>
        <input
          id={id}
          value={text}
          onChange={(e) => setText(e.target.value)}
          placeholder="要改什么"
        />
      </div>
      <div className="set-actions">
        <button type="button" className="btn primary" onClick={onApprove}>
          批准执行
        </button>
        <button type="button" className="btn ghost" onClick={onReject}>
          拒绝
        </button>
        <button
          type="button"
          className="btn"
          onClick={() => onFeedback(text.trim() || "继续聊这个计划")}
        >
          继续聊计划
        </button>
      </div>
    </section>
  );
}
