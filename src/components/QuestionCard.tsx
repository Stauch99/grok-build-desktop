import { useRef, useState, type KeyboardEvent } from "react";
import { useT } from "../lib/locale-context";
import {
  applyImeComposition,
  emptyImeEnterState,
  imeBlocksEnter,
  imeEnterShouldPreventDefault,
} from "../lib/ime-enter";

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
  const imeRef = useRef(emptyImeEnterState());

  const submitCustom = () => {
    const trimmed = customText.trim();
    if (!trimmed) return;
    setCustomText("");
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
      <h4>{title}</h4>
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
          onSubmit={(e) => {
            e.preventDefault();
            submitCustom();
          }}
        >
          <input
            type="text"
            className="perm-custom-input"
            placeholder={t("question.freeText")}
            value={customText}
            onChange={(e) => setCustomText(e.target.value)}
            onKeyDown={(e) => {
              e.stopPropagation();
              if (e.key === "Escape") {
                e.preventDefault();
                setCustomText("");
                e.currentTarget.blur();
                return;
              }
              if (e.key !== "Enter") return;
              const keyLike = {
                key: e.key,
                isComposing: e.nativeEvent.isComposing,
                keyCode: e.nativeEvent.keyCode,
              };
              // Enter confirming an IME candidate must not submit the form.
              if (imeBlocksEnter(keyLike, imeRef.current, Date.now())) {
                if (imeEnterShouldPreventDefault(keyLike, imeRef.current, Date.now())) {
                  e.preventDefault();
                }
              }
            }}
            onCompositionStart={() => {
              imeRef.current = applyImeComposition(imeRef.current, "start", Date.now());
            }}
            onCompositionEnd={() => {
              imeRef.current = applyImeComposition(imeRef.current, "end", Date.now());
            }}
          />
          <button
            type="submit"
            className="perm-custom-send"
            disabled={!customText.trim()}
          >
            {t("question.freeSend")}
          </button>
        </form>
      ) : null}
      {onCustomAnswer ? <p className="permission-hint">{t("question.freeHint")}</p> : null}
    </div>
  );
}
