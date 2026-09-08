import { t, type Locale } from "../../lib/i18n";
import type { HeatMetric } from "../../lib/memory-growth";

export function GrowthToggle({
  locale,
  metric,
  onChange,
}: {
  locale: Locale;
  metric: HeatMetric;
  onChange: (m: HeatMetric) => void;
}) {
  const index = metric === "intimacy" ? 0 : 1;
  return (
    <div className="growth-toggle-wrap">
      <div
        className="choice-switch"
        role="radiogroup"
        aria-label={t(locale, "memory.growth.metrics")}
        style={{
          ["--choice-n" as string]: 2,
          ["--choice-i" as string]: index,
        }}
      >
        <span className="choice-switch-thumb" aria-hidden />
        <button
          type="button"
          role="radio"
          aria-checked={metric === "intimacy"}
          className={metric === "intimacy" ? "on" : undefined}
          onClick={() => onChange("intimacy")}
        >
          {t(locale, "memory.growth.intimacy")}
        </button>
        <button
          type="button"
          role="radio"
          aria-checked={metric === "growth"}
          className={metric === "growth" ? "on" : undefined}
          onClick={() => onChange("growth")}
        >
          {t(locale, "memory.growth.growth")}
        </button>
      </div>
      <p className="growth-toggle-hint">
        {t(locale, metric === "intimacy" ? "memory.growth.intimacyHint" : "memory.growth.growthHint")}
      </p>
    </div>
  );
}
