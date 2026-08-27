import { useState, type KeyboardEvent } from "react";

export type QuestionOption = { id: string; label: string };

export type QuestionCardProps = {
  title: string;
  options: QuestionOption[];
  onPick: (id: string) => void;
};

/**
 * Structured AskUserQuestion options. Digits 1–9 pick a row.
 */
export function QuestionCard({ title, options, onPick }: QuestionCardProps) {
  const [index, setIndex] = useState(0);

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
      <h4>{title}</h4>
      <p className="permission-hint">按 1–9 选择</p>
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
    </div>
  );
}
