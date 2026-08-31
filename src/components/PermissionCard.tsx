import { useEffect, useState, type KeyboardEvent } from "react";
import { isAllowOption, pickAllowOption, type PermissionOption } from "../lib/permission-allow";
import { t, type Locale } from "../lib/i18n";
import { permissionTimeoutNotice } from "../lib/permission-copy";
import { rejectCountdownLabel, secondsUntilReject } from "../lib/permission-queue";

export type PermissionCardProps = {
  title: string;
  options: PermissionOption[];
  onPick: (id: string) => void;
  onAlwaysAllow: () => void;
  timedOut?: boolean;
  timeoutNotice?: string;
  locale?: Locale;
  receivedAt?: number;
};

export type PermissionPickContext = {
  options: PermissionOption[];
  remember: boolean;
  timedOut?: boolean;
  onPick: (id: string) => void;
  onAlwaysAllow: () => void;
};

/** Timeout is notice-only; Allow / Deny stay available. */
export function applyPermissionPick(id: string, ctx: PermissionPickContext): void {
  const opt = ctx.options.find((o) => o.optionId === id);
  if (ctx.remember && opt && isAllowOption(opt)) {
    ctx.onAlwaysAllow();
    return;
  }
  ctx.onPick(id);
}

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
  locale = "zh",
  receivedAt,
}: PermissionCardProps) {
  const [index, setIndex] = useState(0);
  const [remember, setRemember] = useState(false);
  const [mountedAt] = useState(() => Date.now());
  const [now, setNow] = useState(mountedAt);
  const startedAt = receivedAt ?? mountedAt;

  useEffect(() => {
    setIndex((i) => {
      if (options.length === 0) return 0;
      return Math.min(i, options.length - 1);
    });
  }, [options.length]);

  useEffect(() => {
    if (timedOut) return;
    const id = window.setInterval(() => setNow(Date.now()), 1000);
    return () => window.clearInterval(id);
  }, [timedOut]);

  const left = timedOut ? 0 : secondsUntilReject(startedAt, now);
  const showTimeoutNotice = timedOut || left <= 0;
  const pickCtx: PermissionPickContext = { options, remember, timedOut, onPick, onAlwaysAllow };

  const allowOnce = () => {
    if (remember) {
      onAlwaysAllow();
      return;
    }
    const pick = pickAllowOption(options);
    if (pick) applyPermissionPick(pick, pickCtx);
  };

  const handlePick = (id: string) => {
    applyPermissionPick(id, pickCtx);
  };

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
      if (opt) handlePick(opt.optionId);
    }
  };

  return (
    <div
      className="permission"
      id="permission-card"
      tabIndex={0}
      role="group"
      aria-label={t(locale, "perm.title")}
      data-keys="1-9,ArrowUp,ArrowDown,Enter"
      onKeyDown={onKeyDown}
    >
      <h4>{t(locale, "perm.title")}</h4>
      <pre className="permission-cmd" title={title}>{title}</pre>
      {showTimeoutNotice ? (
        <p className="permission-timeout" role="status">
          {timeoutNotice || permissionTimeoutNotice()}
        </p>
      ) : (
        <>
          <p className="permission-hint" role="status">
            {rejectCountdownLabel(left, locale)}
          </p>
          <p className="permission-hint">{t(locale, "perm.hint")}</p>
        </>
      )}
      <label className="permission-hint">
        <input
          type="checkbox"
          checked={remember}
          onChange={(e) => setRemember(e.target.checked)}
        />
        {" "}
        {t(locale, "perm.remember")}
      </label>
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
              onClick={() => handlePick(opt.optionId)}
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
          onClick={allowOnce}
        >
          {t(locale, "perm.allowOnce")}
        </button>
      </div>
    </div>
  );
}