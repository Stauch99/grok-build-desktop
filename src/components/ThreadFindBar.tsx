import { useEffect, useRef } from "react";
import { IconChevron, IconChevronUp, IconClose } from "../icons";
import { useT } from "../lib/locale-context";

export type ThreadFindBarProps = {
  query: string;
  /** 0-based index of the current hit; -1 when there are no hits. */
  index: number;
  total: number;
  onQuery: (query: string) => void;
  onStep: (dir: 1 | -1) => void;
  onClose: () => void;
};

/**
 * In-thread find bar (⌘/Ctrl+F). Floating inside the pane, scoped to the
 * conversation: Enter/↓ steps forward, Shift+Enter/↑ back, Esc closes.
 */
export function ThreadFindBar({ query, index, total, onQuery, onStep, onClose }: ThreadFindBarProps) {
  const t = useT();
  const inputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    inputRef.current?.focus();
    inputRef.current?.select();
  }, []);

  const count = !query
    ? ""
    : total > 0
      ? `${index + 1}/${total}`
      : t("thread.findNone");

  return (
    <div className="thread-find" role="search" aria-label={t("thread.find")}>
      <input
        ref={inputRef}
        type="search"
        value={query}
        placeholder={t("thread.findPlaceholder")}
        aria-label={t("thread.find")}
        onChange={(e) => onQuery(e.target.value)}
        onKeyDown={(e) => {
          if (e.nativeEvent.isComposing) return;
          if (e.key === "Enter") {
            e.preventDefault();
            onStep(e.shiftKey ? -1 : 1);
          } else if (e.key === "ArrowDown") {
            e.preventDefault();
            onStep(1);
          } else if (e.key === "ArrowUp") {
            e.preventDefault();
            onStep(-1);
          } else if (e.key === "Escape") {
            e.preventDefault();
            e.stopPropagation();
            onClose();
          }
        }}
      />
      <span className="thread-find-count" aria-live="polite">
        {count}
      </span>
      <button
        type="button"
        aria-label={t("thread.findPrev")}
        disabled={total === 0}
        onClick={() => onStep(-1)}
      >
        <IconChevronUp size={14} />
      </button>
      <button
        type="button"
        aria-label={t("thread.findNext")}
        disabled={total === 0}
        onClick={() => onStep(1)}
      >
        <IconChevron size={14} />
      </button>
      <button type="button" aria-label={t("common.close")} onClick={onClose}>
        <IconClose size={14} />
      </button>
    </div>
  );
}
