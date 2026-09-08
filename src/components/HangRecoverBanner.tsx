import { useT } from "../lib/locale-context";

export type HangRecoverBannerProps = {
  quietMs: number;
  onResend: () => void;
  onDraft: () => void;
  onWait: () => void;
};

/** Manual recovery after a busy turn goes quiet with nothing in flight. */
export function HangRecoverBanner({ quietMs, onResend, onDraft, onWait }: HangRecoverBannerProps) {
  const t = useT();
  const secs = Math.max(1, Math.round(quietMs / 1000));
  return (
    <div className="permission" role="alertdialog" aria-label={t("stall.recoverTitle")}>
      <h4>{t("stall.recoverTitle")}</h4>
      <p className="permission-hint">{t("stall.recoverBody", { secs })}</p>
      <div className="set-actions">
        <button type="button" className="btn primary" onClick={onResend}>
          {t("stall.recoverResend")}
        </button>
        <button type="button" className="btn ghost" onClick={onDraft}>
          {t("stall.recoverDraft")}
        </button>
        <button type="button" className="btn ghost" onClick={onWait}>
          {t("stall.recoverWait")}
        </button>
      </div>
    </div>
  );
}
