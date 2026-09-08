import { usageTone } from "../lib/time";
import { useLocale } from "../lib/locale-context";
import { usageHoverLines, usageRingDash, usageRingPercents, type UsageSplit } from "../lib/usage-split";

export type UsageRingProps = {
  usage: UsageSplit;
  compactPercent?: number;
  onCompact?: (pct: number) => void;
};

const RING_SIZE = 14;
const RING_RADIUS = 5;

/**
 * Window fill as a quiet ring. Hover for used / size / percent.
 * Clicking triggers a compact prompt when context usage is high.
 */
export function UsageRing({ usage, compactPercent = 85, onCompact }: UsageRingProps) {
  const locale = useLocale();
  const p = usageRingPercents(usage);
  const tone = usageTone(p.used, compactPercent);
  const lines = usageHoverLines(usage, locale);
  const { circumference, dash } = usageRingDash(p.used, RING_RADIUS);
  const label = lines[0] ?? "";
  const canCompact = !!onCompact && p.used >= compactPercent;

  return (
    <button
      type="button"
      className={`usage-chip usage-chip-${tone}${canCompact ? " clickable" : ""}`}
      tabIndex={0}
      aria-label={label}
      onClick={canCompact ? () => onCompact(p.used ?? compactPercent) : undefined}
      style={{ background: "none", border: "none", padding: 0, cursor: canCompact ? "pointer" : "default" }}
    >
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
    </button>
  );
}
