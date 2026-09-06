import { useT } from "../lib/locale-context";

export type RunCockpitProps = {
  stall?: string | null;
  onDoctor: () => void;
  onRetry?: () => void;
};

/**
 * Mid-turn stall actions. Compact stays on the CLI (`/compact` or auto-compact).
 */
export function RunCockpit({ stall, onDoctor, onRetry }: RunCockpitProps) {
  const t = useT();
  return (
    <section className="permission">
      <h4>{t("run.stalled")}</h4>
      <p className="permission-hint">{stall || t("run.stalledHint")}</p>
      <div className="set-actions">
        {onRetry ? (
          <button type="button" className="btn primary" onClick={onRetry}>
            {t("run.retry")}
          </button>
        ) : null}
        <button type="button" className={onRetry ? "btn ghost" : "btn primary"} onClick={onDoctor}>
          {t("run.doctor")}
        </button>
      </div>
    </section>
  );
}
