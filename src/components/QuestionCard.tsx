import { useState, type KeyboardEvent } from "react";
import { useT } from "../lib/locale-context";

export type QuestionOption = { id: string; label: string };

export type QuestionCardProps = {
  title: string;
  options: QuestionOption[];
  onPick: (id: string) => void;
  onCustomAnswer?: (text: string) => void;
};

/**
 * Structured AskUserQuestion options. Digits 1–9 pick a row.
 * A custom text entry allows answering when the preset choices don't fit.
 */
export function QuestionCard({ title, options, onPick, onCustomAnswer }: QuestionCardProps) {
  const t = useT();
  const [index, setIndex] = useState(0);
  const [customText, setCustomText] = useState("");

  const submitCustom = () => {
    const trimmed = customText.trim();
    if (!trimmed) return;
    onCustomAnswer?.(trimmed);
  };

  const onKeyDown = (e: KeyboardEvent<HTMLDivElement>) => {
    if (/^[1-9]$/.test(e.key)) {
      const opt = options[Number(e.key) - 1];
      if (!opt) return;
      e.preventDefault();
      e.stopPropagation();
      onPick(opt.id);
      return;
    }
    if (options.length === 0) return;
    if (e.key === "ArrowDown") {
      e.preventDefault();
      e.stopPropagation();
      setIndex((i) => Math.min(i + 1, options.length - 1));
      return;
    }
    if (e.key === "ArrowUp") {
      e.preventDefault();
      e.stopPropagation();
      setIndex((i) => Math.max(i - 1, 0));
      return;
    }
    if (e.key === "Enter" && e.target === e.currentTarget) {
      e.preventDefault();
      e.stopPropagation();
      const opt = options[index];
      if (opt) onPick(opt.id);
    }
  };

  return (
    <div
      className="permission"
      tabIndex={0}
      role="group"
      aria-label={title}
      data-keys="1-9"
      onKeyDown={onKeyDown}
    >
      <h4 data-tip={title}>{title}</h4>
      <p className="permission-hint">{t("perm.pickNine")}</p>
      <div className="opts">
        {options.map((opt, i) => {
          const hotkey = i < 9 ? String(i + 1) : undefined;
          return (
            <button
              key={opt.id}
              type="button"
              className={`perm-opt${i === index ? " active" : ""}`}
              data-hotkey={hotkey}
              aria-current={i === index ? "true" : undefined}
              onClick={() => onPick(opt.id)}
              onMouseEnter={() => setIndex(i)}
            >
              {hotkey ? <kbd>{hotkey}</kbd> : null}
              <span className="perm-opt-label">{opt.label}</span>
            </button>
          );
        })}
      </div>
      {onCustomAnswer ? (
        <form
          className="perm-custom-row"
          style={{ marginTop: "10px", display: "flex", gap: "6px" }}
          onSubmit={(e) => {
            e.preventDefault();
            submitCustom();
          }}
        >
          <input
            type="text"
            className="input"
            style={{ flex: 1, fontSize: "13px", padding: "4px 8px" }}
            placeholder={t("question.freeText")}
            value={customText}
            onChange={(e) => setCustomText(e.target.value)}
            onKeyDown={(e) => e.stopPropagation()}
          />
          <button
            type="submit"
            className="secondary-btn small"
            disabled={!customText.trim()}
            style={{ fontSize: "12px", padding: "4px 10px" }}
          >
            {t("question.freeSend")}
          </button>
        </form>
      ) : null}
    </div>
  );
}
