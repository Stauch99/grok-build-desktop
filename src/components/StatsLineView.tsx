import { formatStatsFooter, sparklinePoints, type StatsLine } from "../lib/usage-split";

export type StatsLineViewProps = {
  stats: StatsLine | null;
  sessionTokens?: number;
  usageHistory?: { at: number; used: number }[];
};

export function StatsLineView({ stats, sessionTokens, usageHistory = [] }: StatsLineViewProps) {
  const points = sparklinePoints(usageHistory, 56, 14);
  return (
    <span className="composer-meta">
      {points ? (
        <svg width="56" height="14" viewBox="0 0 56 14" aria-hidden>
          <polyline fill="none" stroke="currentColor" strokeWidth="1.2" points={points} />
        </svg>
      ) : null}
      {formatStatsFooter({
        ttftMs: stats?.ttftMs,
        toksPerSec: stats?.toksPerSec,
        sessionTokens,
      })}
    </span>
  );
}
