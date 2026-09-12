import { usageTrend } from "../lib/usage-split";
import { useT } from "../lib/locale-context";

export type TokenChartProps = {
  points: { at: number; used: number; size: number }[];
  days: 7 | 30;
  onDays: (d: 7 | 30) => void;
};

/**
 * Token usage bars from usageTrend. Counts tokens only — no dollar pricing.
 */
export function TokenChart({ points, days, onDays }: TokenChartProps) {
  const t = useT();
  const rows = usageTrend(points, days);

  return (
    <div>
      <div className="hub-nav" role="tablist" aria-label={t("usage.range")}>
        <button
          type="button"
          className={days === 7 ? "active" : undefined}
          onClick={() => onDays(7)}
        >
          {t("usage.days7")}
        </button>
        <button
          type="button"
          className={days === 30 ? "active" : undefined}
          onClick={() => onDays(30)}
        >
          {t("usage.days30")}
        </button>
      </div>
      {rows.length === 0 ? (
        <p className="float-empty">{t("usage.noHistory")}</p>
      ) : (
        <div
          className="token-bars pane-in"
          key={days}
          role="img"
          aria-label={t("usage.daysN", { n: days })}
        >
          {rows.map((p) => {
            const pct = p.size > 0 ? Math.min(100, Math.round((p.used / p.size) * 100)) : 0;
            return (
              <div
                key={p.at}
                style={{ height: `${Math.max(pct, 2)}%` }}
              />
            );
          })}
        </div>
      )}
    </div>
  );
}
