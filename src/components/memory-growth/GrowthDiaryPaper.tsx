import { t, type Locale } from "../../lib/i18n";
import type { DiaryEntry } from "../../lib/memory-view";
import { selectedDiary } from "../../lib/memory-view";

export function GrowthDiaryPaper({
  locale,
  entries,
  selectedDay,
}: {
  locale: Locale;
  entries: DiaryEntry[];
  selectedDay: string | null;
}) {
  const entry = selectedDiary(entries, selectedDay);
  if (!entry) {
    return (
      <article className="growth-paper">
        <p className="growth-paper-kicker">{t(locale, "memory.growth.diaryTitle")}</p>
        <p className="growth-paper-empty">{t(locale, "memory.growth.diaryEmpty")}</p>
      </article>
    );
  }
  return (
    <article className="growth-paper">
      <p className="growth-paper-kicker">{t(locale, "memory.growth.diaryTitle")}</p>
      <h3>{entry.date}</h3>
      <div className="growth-paper-body">{entry.body || t(locale, "memory.growth.diaryEmpty")}</div>
    </article>
  );
}
