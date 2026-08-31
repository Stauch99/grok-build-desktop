import { formatStatsFooter, type StatsLine } from "../lib/usage-split";
import { useLocale } from "../lib/locale-context";

export type StatsLineViewProps = {
  stats: StatsLine | null;
  sessionTokens?: number;
  /** Kept so callers can pass history; the footer is text-only to avoid a cramped sparkline. */
  usageHistory?: { at: number; used: number }[];
};

export function StatsLineView({ stats, sessionTokens }: StatsLineViewProps) {
  const locale = useLocale();
  return (
    <span className="composer-meta">
      <span className="composer-meta-text">
        {formatStatsFooter({
          ttftMs: stats?.ttftMs,
          toksPerSec: stats?.toksPerSec,
          sessionTokens,
        }, locale)}
      </span>
    </span>
  );
}
