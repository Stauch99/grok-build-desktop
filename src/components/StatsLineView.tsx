import { formatStatsFooter, formatStatsFooterTip, type StatsLine } from "../lib/usage-split";
import { useLocale } from "../lib/locale-context";

export type StatsLineViewProps = {
  stats: StatsLine | null;
  sessionTokens?: number;
  /** Kept so callers can pass history; the footer is text-only to avoid a cramped sparkline. */
  usageHistory?: { at: number; used: number }[];
};

export function StatsLineView({ stats, sessionTokens }: StatsLineViewProps) {
  const locale = useLocale();
  const payload = {
    ttftMs: stats?.ttftMs,
    toksPerSec: stats?.toksPerSec,
    sessionTokens,
  };
  const tip = formatStatsFooterTip(payload, locale);
  return (
    <span className="composer-meta" data-tip={tip} aria-label={tip}>
      <span className="composer-meta-text">
        {formatStatsFooter(payload, locale)}
      </span>
    </span>
  );
}
