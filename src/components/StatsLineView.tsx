import { formatStatsFooter, type StatsLine } from "../lib/usage-split";

export type StatsLineViewProps = {
  stats: StatsLine | null;
  sessionTokens?: number;
};

export function StatsLineView({ stats, sessionTokens }: StatsLineViewProps) {
  return (
    <span className="composer-meta">
      {formatStatsFooter({
        ttftMs: stats?.ttftMs,
        toksPerSec: stats?.toksPerSec,
        sessionTokens,
      })}
    </span>
  );
}
