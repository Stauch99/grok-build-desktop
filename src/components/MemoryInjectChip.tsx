import { t, type Locale } from "../lib/i18n";

type Props = {
  locale: Locale;
  onOpen: () => void;
  onDismiss: () => void;
};

export function MemoryInjectChip({ locale, onOpen, onDismiss }: Props) {
  return (
    <div className="memory-inject-chip">
      <button type="button" onClick={onOpen}>
        {t(locale, "memory.loadedChip")}
      </button>
      <button type="button" onClick={onDismiss} aria-label={t(locale, "memory.dismissChip")}>
        {t(locale, "memory.dismissChip")}
      </button>
    </div>
  );
}
