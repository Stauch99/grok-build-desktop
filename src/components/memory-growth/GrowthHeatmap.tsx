import { t, type Locale } from "../../lib/i18n";
import type { HeatCell } from "../../lib/memory-growth";

export function GrowthHeatmap({
  locale,
  grid,
  selectedDay,
  onSelect,
}: {
  locale: Locale;
  grid: HeatCell[][];
  selectedDay: string | null;
  onSelect: (day: string) => void;
}) {
  return (
    <div className="growth-heat" role="img" aria-label={t(locale, "memory.growth.heatmap")}>
      <div className="growth-heat-months">
        {grid.map((col, i) => (
          <span key={i}>{col[0]?.monthLabel ?? ""}</span>
        ))}
      </div>
      <div className="growth-heat-grid">
        {grid.map((col, i) => (
          <div key={i} className="growth-heat-col">
            {col.map((cell) => (
              <button
                key={cell.day}
                type="button"
                className={`growth-heat-cell${selectedDay === cell.day ? " selected" : ""}`}
                data-level={cell.level}
                data-tip={`${cell.day} · ${cell.raw}`}
                aria-label={`${cell.day} ${cell.raw}`}
                onClick={() => onSelect(cell.day)}
              />
            ))}
          </div>
        ))}
      </div>
    </div>
  );
}
