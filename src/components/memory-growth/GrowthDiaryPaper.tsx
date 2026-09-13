import { t, type Locale } from "../../lib/i18n";
import { filterDiary } from "../../lib/memory-search";
import type { DiaryEntry } from "../../lib/memory-view";
import { selectedDiary } from "../../lib/memory-view";
import { HighlightText } from "../HighlightText";

export function GrowthDiaryPaper({
  locale,
  entries,
  selectedDay,
  query = "",
}: {
  locale: Locale;
  entries: DiaryEntry[];
  selectedDay: string | null;
  query?: string;
}) {
  const q = query.trim();
  if (q) {
    const hits = filterDiary(entries, q);
    if (!hits.length) {
      return (
        <article className="growth-paper">
          <p className="growth-paper-kicker">{t(locale, "memory.growth.diaryTitle")}</p>
          <p className="growth-paper-empty">{t(locale, "memory.growth.searchEmpty")}</p>
        </article>
      );
    }
    return (
      <div className="growth-paper-list">
        {hits.map((entry) => (
          <article className="growth-paper" key={entry.date}>
            <h3>
              <HighlightText text={entry.date} query={q} />
            </h3>
            <div className="growth-paper-body">
              <HighlightText text={entry.body || t(locale, "memory.growth.diaryEmpty")} query={q} />
            </div>
          </article>
        ))}
      </div>
    );
  }
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
