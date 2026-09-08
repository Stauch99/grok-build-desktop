import { useEffect, useRef, type ReactNode } from "react";
import { IconGrokMore } from "../../grok-icons";
import { t, type Locale } from "../../lib/i18n";

export function GrowthHeader({
  locale,
  displayName,
  tagline,
  companions,
  sessions,
  streak,
  menuOpen,
  onToggleMenu,
  onCloseMenu,
  children,
}: {
  locale: Locale;
  displayName: string;
  tagline: string | null;
  companions: number;
  sessions: number;
  streak: number;
  menuOpen: boolean;
  onToggleMenu: () => void;
  onCloseMenu: () => void;
  children?: ReactNode;
}) {
  const wrapRef = useRef<HTMLDivElement>(null);
  const title = displayName.trim()
    ? t(locale, "memory.growth.titleNamed", { name: displayName.trim() })
    : t(locale, "memory.growth.titleDefault");

  useEffect(() => {
    if (!menuOpen) return;
    const onDown = (e: MouseEvent) => {
      if (e.target instanceof Node && wrapRef.current?.contains(e.target)) return;
      onCloseMenu();
    };
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") onCloseMenu();
    };
    window.addEventListener("mousedown", onDown);
    window.addEventListener("keydown", onKey);
    return () => {
      window.removeEventListener("mousedown", onDown);
      window.removeEventListener("keydown", onKey);
    };
  }, [menuOpen, onCloseMenu]);

  return (
    <header className="growth-header">
      <div className="growth-header-row">
        <h2>{title}</h2>
        <div className="growth-menu-wrap" ref={wrapRef}>
          <button
            type="button"
            className="icon-btn growth-menu-btn"
            aria-haspopup="menu"
            aria-expanded={menuOpen}
            aria-label={t(locale, "memory.growth.menu")}
            onClick={onToggleMenu}
          >
            <IconGrokMore size={16} />
          </button>
          {menuOpen ? (
            <div className="menu" role="menu">
              {children}
            </div>
          ) : null}
        </div>
      </div>
      <p className="growth-tagline">{tagline?.trim() || t(locale, "memory.growth.taglineFallback")}</p>
      <p className="growth-stats">
        {t(locale, "memory.growth.stats", { days: companions, sessions, streak })}
      </p>
    </header>
  );
}
