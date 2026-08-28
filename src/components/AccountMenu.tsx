import { useEffect, useRef, useState } from "react";
import { usageTone } from "../lib/time";
import { weeklyUsageCopy, type WeeklyUsage } from "../lib/weekly-usage";

export type AccountMenuProps = {
  signedIn: boolean;
  compact?: boolean;
  weeklyUsage?: WeeklyUsage | null;
  onSettings: () => void;
  onExtensions: () => void;
  onShortcuts: () => void;
};

export function AccountMenu({
  signedIn,
  compact = false,
  weeklyUsage = null,
  onSettings,
  onExtensions,
  onShortcuts,
}: AccountMenuProps) {
  const [open, setOpen] = useState(false);
  const wrapRef = useRef<HTMLDivElement>(null);
  const copy = weeklyUsageCopy(weeklyUsage, signedIn);
  const tone = usageTone(copy.percent ?? null, 85);

  useEffect(() => {
    if (!open) return;
    const onDown = (e: MouseEvent) => {
      if (e.target instanceof Node && wrapRef.current?.contains(e.target)) return;
      setOpen(false);
    };
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") setOpen(false);
    };
    window.addEventListener("mousedown", onDown);
    window.addEventListener("keydown", onKey);
    return () => {
      window.removeEventListener("mousedown", onDown);
      window.removeEventListener("keydown", onKey);
    };
  }, [open]);

  function pick(fn: () => void) {
    setOpen(false);
    fn();
  }

  const title = copy.detail ? `${copy.title} · ${copy.detail}` : copy.title;

  return (
    <div className="side-account" ref={wrapRef}>
      <button
        type="button"
        className={`account-trigger${compact ? " compact" : ""}`}
        aria-haspopup="menu"
        aria-expanded={open}
        aria-label={title}
        title={title}
        onClick={() => setOpen((o) => !o)}
      >
        {copy.percent != null ? (
          <span className={`account-usage usage-chip-${tone}`}>
            <span className="usage-bar" aria-hidden>
              <span className="usage-bar-fill" style={{ width: `${copy.percent}%` }} />
            </span>
            {compact ? `${copy.percent}%` : copy.title}
            {!compact && copy.detail ? <span className="account-usage-reset">{copy.detail}</span> : null}
          </span>
        ) : (
          copy.title
        )}
      </button>
      {open ? (
        <div className="menu account-pop" role="menu">
          <button type="button" role="menuitem" onClick={() => pick(onSettings)}>
            设置
          </button>
          <button type="button" role="menuitem" onClick={() => pick(onExtensions)}>
            扩展中心
          </button>
          <button type="button" role="menuitem" onClick={() => pick(onShortcuts)}>
            快捷键
          </button>
        </div>
      ) : null}
    </div>
  );
}
