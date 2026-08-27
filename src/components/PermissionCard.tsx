import { useEffect, useState, type KeyboardEvent } from "react";
import type { PermissionOption } from "../lib/permission-allow";

export type PermissionCardProps = {
  title: string;
  options: PermissionOption[];
  onPick: (id: string) => void;
  onAlwaysAllow: () => void;
  timedOut?: boolean;
  timeoutNotice?: string;
};

/**
 * Permission prompt. Options are equal-weight rows — the highlight is a
 * background, never a color inversion, so hover stays readable.
 */
export function PermissionCard({
  title,
  options,
  onPick,
  onAlwaysAllow,
  timedOut,
  timeoutNotice,
}: PermissionCardProps) {
  const [index, setIndex] = useState(0);

  useEffect(() => {
    setIndex((i) => {
      if (options.length === 0) return 0;
      return Math.min(i, options.length - 1);
    });
  }, [options.length]);

  const onKeyDown = (e: KeyboardEvent<HTMLDivElement>) => {
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
    if (e.key === "Enter") {
      if (e.target !== e.currentTarget) return;
      e.preventDefault();
      e.stopPropagation();
      const opt = options[index];
      if (opt) onPick(opt.optionId);
    }
  };

  return (
    <div
      className="permission"
      id="permission-card"
      tabIndex={0}
      role="group"
      aria-label="许可请求"
      data-keys="1-9,ArrowUp,ArrowDown,Enter"
      onKeyDown={onKeyDown}
    >
      <h4>许可请求</h4>
      <pre className="permission-cmd">{title}</pre>
      {timedOut ? (
        <p className="permission-timeout" role="status">
          {timeoutNotice || "许可已超时，已自动拒绝。再发一条即可重试。"}
        </p>
      ) : (
        <p className="permission-hint">按 1–4 选择，↑↓ 移动，Enter 确认</p>
      )}
      <div className="opts">
        {options.map((opt, i) => {
          const hotkey = i < 9 ? String(i + 1) : undefined;
          return (
            <button
              key={opt.optionId}
              type="button"
              className={`perm-opt${i === index ? " active" : ""}`}
              data-hotkey={hotkey}
              data-option-index={i}
              aria-current={i === index ? "true" : undefined}
              onClick={() => onPick(opt.optionId)}
              onMouseEnter={() => setIndex(i)}
            >
              {hotkey ? <kbd>{hotkey}</kbd> : null}
              <span className="perm-opt-label">{opt.name}</span>
            </button>
          );
        })}
        <button
          type="button"
          className="perm-always"
          data-always-allow="true"
          onClick={onAlwaysAllow}
        >
          本次会话总是允许
        </button>
      </div>
    </div>
  );
}
