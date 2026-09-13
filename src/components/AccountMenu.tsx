import { useEffect, useRef, useState } from "react";
import { usageTone } from "../lib/time";
import { useLocale, useT } from "../lib/locale-context";
import { usageRingDash } from "../lib/usage-split";
import { weeklyUsageCopy, type WeeklyUsage } from "../lib/weekly-usage";
import { ShortcutKbd } from "./ShortcutHint";

export type AccountMenuProps = {
  signedIn: boolean;
  compact?: boolean;
  weeklyUsage?: WeeklyUsage | null;
  onSettings: () => void;
  onExtensions: () => void;
  onShortcuts: () => void;
  /** Opens the full usage-stats page (Settings → 用量). */
  onUsage?: () => void;
};

const RING_SIZE = 14;
const RING_RADIUS = 5;
const PEEK_RING_SIZE = 30;
const PEEK_RING_RADIUS = 12;

export function AccountMenu({
  signedIn,
  compact = false,
  weeklyUsage = null,
  onSettings,
  onExtensions,
  onShortcuts,
  onUsage,
}: AccountMenuProps) {
  const t = useT();
  const locale = useLocale();
  const [open, setOpen] = useState(false);
  const wrapRef = useRef<HTMLDivElement>(null);
  const copy = weeklyUsageCopy(weeklyUsage, signedIn, Date.now(), locale);
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
  const pct = copy.percent;
  const { circumference, dash } = usageRingDash(pct ?? 0, RING_RADIUS);
  const peek = usageRingDash(pct ?? 0, PEEK_RING_RADIUS);

  return (
    <div className="side-account" ref={wrapRef}>
      <button
        type="button"
        className={`account-trigger${compact ? " compact" : ""}`}
        aria-haspopup="menu"
        aria-expanded={open}
        aria-label={title}
        onClick={() => setOpen((o) => !o)}
      >
        {pct != null ? (
          <span className={`account-usage usage-chip-${tone}`}>
            <svg className="usage-ring" width={RING_SIZE} height={RING_SIZE} viewBox={`0 0 ${RING_SIZE} ${RING_SIZE}`} aria-hidden>
              <circle className="usage-ring-track" cx={RING_SIZE / 2} cy={RING_SIZE / 2} r={RING_RADIUS} />
              {dash > 0 ? (
                <circle
                  className="usage-ring-fill"
                  cx={RING_SIZE / 2}
                  cy={RING_SIZE / 2}
                  r={RING_RADIUS}
                  strokeDasharray={`${dash} ${circumference}`}
                  transform={`rotate(-90 ${RING_SIZE / 2} ${RING_SIZE / 2})`}
                />
              ) : null}
            </svg>
            {compact ? `${pct}%` : copy.title}
            {!compact && copy.detail ? <span className="account-usage-reset">{copy.detail}</span> : null}
          </span>
        ) : (
          copy.title
        )}
      </button>
      {open ? (
        <div className="menu account-pop" role="menu">
          {pct != null ? (
            <div className="account-peek" role="presentation">
              <svg className={`usage-ring usage-chip-${tone}`} width={PEEK_RING_SIZE} height={PEEK_RING_SIZE} viewBox={`0 0 ${PEEK_RING_SIZE} ${PEEK_RING_SIZE}`} aria-hidden>
                <circle className="usage-ring-track" cx={PEEK_RING_SIZE / 2} cy={PEEK_RING_SIZE / 2} r={PEEK_RING_RADIUS} />
                {peek.dash > 0 ? (
                  <circle
                    className="usage-ring-fill"
                    cx={PEEK_RING_SIZE / 2}
                    cy={PEEK_RING_SIZE / 2}
                    r={PEEK_RING_RADIUS}
                    strokeDasharray={`${peek.dash} ${peek.circumference}`}
                    transform={`rotate(-90 ${PEEK_RING_SIZE / 2} ${PEEK_RING_SIZE / 2})`}
                  />
                ) : null}
              </svg>
              <div className="account-peek-text">
                <strong>{t("account.weekly", { n: pct })}</strong>
                <span>{[weeklyUsage?.tier, copy.detail].filter(Boolean).join(" · ") || t(signedIn ? "account.signed" : "account.unsigned")}</span>
              </div>
            </div>
          ) : null}
          {onUsage ? (
            <button type="button" role="menuitem" onClick={() => pick(onUsage)}>
              {t("settings.usage")}
            </button>
          ) : null}
          <button type="button" role="menuitem" onClick={() => pick(onSettings)}>
            {t("settings.title")}
            <ShortcutKbd id="settings" />
          </button>
          <button type="button" role="menuitem" onClick={() => pick(onExtensions)}>
            {t("hub.title")}
            <ShortcutKbd id="hub" />
          </button>
          <button type="button" role="menuitem" onClick={() => pick(onShortcuts)}>
            {t("settings.shortcuts")}
          </button>
        </div>
      ) : null}
    </div>
  );
}
