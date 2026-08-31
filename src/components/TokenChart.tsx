import { usageTrend } from "../lib/usage-split";

export type TokenChartProps = {
  points: { at: number; used: number; size: number }[];
  days: 7 | 30;
  onDays: (d: 7 | 30) => void;
};

/**
 * Token usage bars from usageTrend. Counts tokens only — no dollar pricing.
 */
export function TokenChart({ points, days, onDays }: TokenChartProps) {
  const rows = usageTrend(points, days);

  return (
    <div>
      <div className="hub-nav" role="tablist" aria-label="用量区间">
        <button
          type="button"
          className={days === 7 ? "active" : undefined}
          onClick={() => onDays(7)}
        >
          7 天
        </button>
        <button
          type="button"
          className={days === 30 ? "active" : undefined}
          onClick={() => onDays(30)}
        >
          30 天
        </button>
      </div>
      {rows.length === 0 ? (
        <p className="float-empty">还没有 token 用量历史。</p>
      ) : (
        <div
          className="token-bars pane-in"
          key={days}
          role="img"
          aria-label={`${days} 天用量`}
        >
          {rows.map((p) => {
            const pct = p.size > 0 ? Math.min(100, Math.round((p.used / p.size) * 100)) : 0;
            return (
              <div
                key={p.at}
                title={`${p.used} / ${p.size}`}
                style={{ height: `${Math.max(pct, 2)}%` }}
              />
            );
          })}
        </div>
      )}
    </div>
  );
}
