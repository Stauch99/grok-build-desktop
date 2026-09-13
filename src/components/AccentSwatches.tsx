import type { CSSProperties } from "react";
import { ACCENT_PRESETS, type AccentId } from "../lib/accent";
import { t, type Locale } from "../lib/i18n";

export function AccentSwatches({
  value,
  locale,
  onChange,
}: {
  value: AccentId;
  locale: Locale;
  onChange: (id: AccentId) => void;
}) {
  return (
    <div className="accent-swatches" role="radiogroup" aria-label={t(locale, "settings.accent")}>
      {ACCENT_PRESETS.map((row) => (
        <button
          key={row.id}
          type="button"
          role="radio"
          aria-checked={value === row.id}
          aria-label={t(locale, row.labelKey)}
          className={value === row.id ? "accent-swatch on" : "accent-swatch"}
          style={{ ["--swatch" as string]: row.hex } as CSSProperties}
          onClick={() => onChange(row.id)}
        />
      ))}
    </div>
  );
}
