import { useId, useState } from "react";
import { useT } from "../lib/locale-context";

export type PlanCompleteCardProps = {
  title?: string;
  onApprove: () => void;
  onReject: () => void;
  onFeedback: (text: string) => void;
};

/**
 * Plan complete: approve, reject, or send feedback.
 */
export function PlanCompleteCard({
  title,
  onApprove,
  onReject,
  onFeedback,
}: PlanCompleteCardProps) {
  const t = useT();
  const [text, setText] = useState("");
  const id = useId();
  const heading = title ?? t("plan.complete");

  return (
    <section className="permission">
      <h4>{heading}</h4>
      <p className="permission-hint">{t("plan.doneHint")}</p>
      <div className="set-stack">
        <label htmlFor={id}>{t("plan.feedback")}</label>
        <input
          id={id}
          value={text}
          onChange={(e) => setText(e.target.value)}
          placeholder={t("plan.feedbackPh")}
        />
      </div>
      <div className="set-actions">
        <button type="button" className="btn primary" onClick={onApprove}>
          {t("plan.approve")}
        </button>
        <button type="button" className="btn ghost" onClick={onReject}>
          {t("plan.reject")}
        </button>
        <button
          type="button"
          className="btn"
          onClick={() => onFeedback(text.trim() || t("plan.keepTalkingDefault"))}
        >
          {t("plan.keepTalking")}
        </button>
      </div>
    </section>
  );
}
