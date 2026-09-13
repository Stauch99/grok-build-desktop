import { useEffect, useRef, useState, useSyncExternalStore } from "react";
import {
  clearNotifyCenter,
  markNotifyRead,
  notifyCenterSnapshot,
  subscribeNotifyCenter,
  type NotifyEntry,
} from "../lib/notify-center";
import { useLocale, useT } from "../lib/locale-context";
import { trapFocus } from "../lib/trap-focus";
import { IconAlert, IconBell, IconChecklist } from "../icons";

export type NotificationCenterProps = {
  /** Open the session a notification came from. */
  onOpenSession: (sessionId: string) => void;
};

function entryTime(at: number, locale: string): string {
  try {
    return new Date(at).toLocaleTimeString(locale === "zh" ? "zh-CN" : "en", {
      hour: "2-digit",
      minute: "2-digit",
    });
  } catch {
    return "";
  }
}

function EntryIcon({ kind }: { kind: NotifyEntry["kind"] }) {
  if (kind === "needs-you") return <IconAlert size={14} />;
  return <IconChecklist size={14} />;
}

/**
 * Bell + dropdown in the pane header. Mirrors the OS notifications the app
 * already sends, so a ping is reachable after it fades. Clicking an entry
 * jumps to its session and marks it read.
 */
export function NotificationCenter({ onOpenSession }: NotificationCenterProps) {
  const t = useT();
  const locale = useLocale();
  const { entries, unread } = useSyncExternalStore(subscribeNotifyCenter, notifyCenterSnapshot);
  const [open, setOpen] = useState(false);
  const wrapRef = useRef<HTMLDivElement>(null);
  const triggerRef = useRef<HTMLButtonElement>(null);
  const menuRef = useRef<HTMLDivElement>(null);
  const previousActive = useRef<HTMLElement | null>(null);

  useEffect(() => {
    if (!open) return;
    previousActive.current =
      document.activeElement instanceof HTMLElement ? document.activeElement : null;
    menuRef.current?.querySelector<HTMLElement>("button")?.focus();
    const onDown = (e: MouseEvent) => {
      if (e.target instanceof Node && wrapRef.current?.contains(e.target)) return;
      setOpen(false);
    };
    window.addEventListener("mousedown", onDown);
    return () => {
      window.removeEventListener("mousedown", onDown);
      const prev = previousActive.current;
      previousActive.current = null;
      const active = document.activeElement;
      const inside = !!(wrapRef.current && active instanceof Node && wrapRef.current.contains(active));
      if (!inside && active !== document.body) return;
      (prev?.isConnected ? prev : triggerRef.current)?.focus();
    };
  }, [open]);

  const openEntry = (entry: NotifyEntry) => {
    markNotifyRead(entry.id);
    if (entry.sessionId) onOpenSession(entry.sessionId);
    setOpen(false);
  };

  return (
    <div className="chip-wrap notify-wrap" ref={wrapRef}>
      <button
        type="button"
        ref={triggerRef}
        className="icon-btn notify-bell"
        aria-haspopup="menu"
        aria-expanded={open}
        aria-label={unread > 0 ? t("notify.unread", { n: unread }) : t("notify.center")}
        data-tip={t("notify.center")}
        onClick={() => setOpen((v) => !v)}
      >
        <IconBell size={16} />
        {unread > 0 ? <span className="notify-dot" aria-hidden="true" /> : null}
      </button>
      {open ? (
        <div
          className="chip-menu notify-menu"
          role="menu"
          ref={menuRef}
          onKeyDown={(e) => {
            if (e.key === "Escape") {
              e.preventDefault();
              e.stopPropagation();
              setOpen(false);
              return;
            }
            if (e.key === "Tab" && wrapRef.current) trapFocus(wrapRef.current, e.nativeEvent);
          }}
        >
          {entries.length === 0 ? (
            <p className="notify-empty">{t("notify.empty")}</p>
          ) : (
            <ul className="notify-list">
              {entries.map((entry) => (
                <li key={entry.id}>
                  <button
                    type="button"
                    role="menuitem"
                    className={`notify-item${entry.read ? " read" : ""}`}
                    onClick={() => openEntry(entry)}
                  >
                    <span className="notify-item-icon">
                      <EntryIcon kind={entry.kind} />
                    </span>
                    <span className="notify-item-main">
                      <span className="notify-item-title">{entry.title}</span>
                      {entry.body ? <span className="notify-item-body">{entry.body}</span> : null}
                    </span>
                    <span className="notify-item-time">{entryTime(entry.at, locale)}</span>
                  </button>
                </li>
              ))}
            </ul>
          )}
          {entries.length > 0 ? (
            <div className="notify-foot">
              <button type="button" onClick={() => clearNotifyCenter()}>
                {t("notify.clearAll")}
              </button>
            </div>
          ) : null}
        </div>
      ) : null}
    </div>
  );
}
