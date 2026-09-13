import { useEffect, useRef } from "react";
import { trapFocus } from "../lib/trap-focus";
import { useT } from "../lib/locale-context";

export type WhatsNewProps = {
  version: string;
  onClose: () => void;
  leaving?: boolean;
};

const HIGHLIGHT_KEYS = ["whatsnew.h1", "whatsnew.h2", "whatsnew.h3", "whatsnew.h4", "whatsnew.h5"];

/**
 * First-launch-per-version card listing this wave's highlights. Mounted only
 * when whats-new.ts says the running version is unseen; closing needs no
 * extra flag because the version was recorded when shown.
 */
export function WhatsNew({ version, onClose, leaving = false }: WhatsNewProps) {
  const t = useT();
  const layerRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const prev = document.activeElement instanceof HTMLElement ? document.activeElement : null;
    layerRef.current?.querySelector<HTMLElement>("button")?.focus();
    return () => {
      if (prev?.isConnected) prev.focus();
    };
  }, []);

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key !== "Escape" && e.key !== "Enter") return;
      e.preventDefault();
      e.stopPropagation();
      onClose();
    };
    window.addEventListener("keydown", onKey, true);
    return () => window.removeEventListener("keydown", onKey, true);
  }, [onClose]);

  return (
    <div
      ref={layerRef}
      className={`palette-layer${leaving ? " layer-out" : ""}`}
      role="dialog"
      aria-modal="true"
      aria-label={t("whatsnew.title")}
      onKeyDown={(e) => {
        if (e.key === "Tab" && layerRef.current) trapFocus(layerRef.current, e.nativeEvent);
      }}
    >
      <div className="palette-backdrop" onClick={onClose} />
      <div className="palette whatsnew-card">
        <div className="shortcuts-head">
          <span className="palette-group">{t("whatsnew.title")}</span>
          <span className="whatsnew-version">v{version}</span>
        </div>
        <ul className="whatsnew-list">
          {HIGHLIGHT_KEYS.map((key) => (
            <li key={key}>{t(key)}</li>
          ))}
        </ul>
        <div className="whatsnew-foot">
          <button type="button" className="btn primary" onClick={onClose} autoFocus>
            {t("whatsnew.ok")}
          </button>
        </div>
      </div>
    </div>
  );
}
