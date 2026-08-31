import { usageTone } from "../lib/time";
import { useLocale } from "../lib/locale-context";
import { usageHoverLines, usageRingDash, usageRingPercents, type UsageSplit } from "../lib/usage-split";

export type UsageRingProps = {
  usage: UsageSplit;
  compactPercent?: number;
};

const RING_SIZE = 14;
const RING_RADIUS = 5;

/**
 * Window fill as a quiet ring. Hover for used / size / percent.
 */
export function UsageRing({ usage, compactPercent = 85 }: UsageRingProps) {
  const locale = useLocale();
  const p = usageRingPercents(usage);
  const tone = usageTone(p.used, compactPercent);
  const lines = usageHoverLines(usage, locale);
  const { circumference, dash } = usageRingDash(p.used, RING_RADIUS);
  const label = lines[0] ?? "";

  return (
    <span className={`usage-chip usage-chip-${tone}`} tabIndex={0} aria-label={label}>
      <svg className="usage-ring" width={RING_SIZE} height={RING_SIZE} viewBox={`0 0 ${RING_SIZE} ${RING_SIZE}`} aria-hidden>
        <circle className="usage-ring-track" cx={RING_SIZE / 2} cy={RING_SIZE / 2} r={RING_RADIUS} />
        {dash > 0 ? (
          <circle
            className="usage-ring-fill"
            cx={RING_SIZE / 2}
            cy={RING_SIZE / 2}
            r={RING_RADIUS}
            strokeDasharray={`${dash} ${circumference}`}
            transform={`rotate(-90 ${RING_SIZE / 2} ${RING_SIZE / 2})`}
          />
        ) : null}
      </svg>
      <span className="usage-pop" role="tooltip">
        {lines.map((l) => (
          <span key={l}>{l}</span>
        ))}
      </span>
    </span>
  );
}
