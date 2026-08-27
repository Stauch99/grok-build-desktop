import { useState } from "react";
import { usageTone } from "../lib/time";
import { usageBreakdownLines, usageRingPercents, type UsageSplit } from "../lib/usage-split";

export type UsageRingProps = {
  usage: UsageSplit;
  compactPercent?: number;
};

/**
 * Window fill as a single bar. Click for input / output / cache. Auto-compact stays on the CLI.
 */
export function UsageRing({ usage, compactPercent = 85 }: UsageRingProps) {
  const [open, setOpen] = useState(false);
  const p = usageRingPercents(usage);
  const tone = usageTone(p.used, compactPercent);
  const lines = usageBreakdownLines(usage);
  const title =
    p.used >= compactPercent
      ? `上下文 ${p.used}%，已达自动压缩阈值`
      : `上下文 ${p.used}%`;

  return (
    <span className={`usage-chip usage-chip-${tone}`} title={title}>
      <button
        type="button"
        className="usage-chip-btn"
        aria-label={title}
        aria-expanded={open}
        onClick={() => setOpen((o) => !o)}
      >
        <span className="usage-bar" aria-hidden>
          <span className="usage-bar-fill" style={{ width: `${p.used}%` }} />
        </span>
        {p.used}%
      </button>
      {open && lines.length > 0 ? (
        <span className="usage-pop" role="status">
          {lines.map((l) => (
            <span key={l}>{l}</span>
          ))}
        </span>
      ) : null}
    </span>
  );
}
