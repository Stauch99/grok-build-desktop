import { t, type Locale } from "../../lib/i18n";
import { filterTimeline } from "../../lib/memory-search";
import type { TimelineDay, TimelineEvent } from "../../lib/memory-growth";
import { HighlightText } from "../HighlightText";

export function eventLabel(locale: Locale, ev: TimelineEvent): string {
  if (ev.kind === "promote") return t(locale, "memory.growth.eventPromote", { n: ev.count ?? 0 });
  if (ev.kind === "dream_sweep") {
    const k = ev.inChars != null ? Math.round(ev.inChars / 100) / 10 : 0;
    return t(locale, "memory.growth.eventSweep", { n: ev.prompts ?? 1, k });
  }
  if (ev.kind === "mcp_append") return t(locale, "memory.growth.eventMcp", { n: ev.count ?? 0, agent: ev.agent || "CLI" });
  if (ev.kind === "session_new") return t(locale, "memory.growth.eventSession");
  if (ev.kind === "dream_enable") return t(locale, "memory.growth.eventEnable");
  if (ev.kind === "mcp_register") return t(locale, "memory.growth.eventRegister");
  if (ev.kind === "memory_inject") return t(locale, "memory.growth.eventInject");
  return ev.kind;
}

export function GrowthTimeline({
  locale,
  days,
  selectedDay,
  onSelect,
  query = "",
}: {
  locale: Locale;
  days: TimelineDay[];
  selectedDay: string | null;
  onSelect: (day: string) => void;
  query?: string;
}) {
  const ordered = filterTimeline([...days].reverse(), query, (ev) => eventLabel(locale, ev));
  if (!ordered.length) {
    return (
      <p className="growth-timeline-empty">
        {t(locale, query.trim() ? "memory.growth.searchEmpty" : "memory.growth.timelineEmpty")}
      </p>
    );
  }
  return (
    <ol className="growth-timeline">
      {ordered.map((row) => (
        <li key={row.day} className={selectedDay === row.day ? "active" : undefined}>
          <button type="button" className="growth-timeline-day" onClick={() => onSelect(row.day)}>
            <HighlightText text={row.day} query={query} />
          </button>
          <ul>
            {row.events.length === 0 ? (
              <li className="growth-timeline-chip">{t(locale, "memory.growth.eventDiary")}</li>
            ) : (
              row.events.map((ev, i) => (
                <li key={`${ev.at}-${i}`} className="growth-timeline-chip">
                  <HighlightText text={eventLabel(locale, ev)} query={query} />
                </li>
              ))
            )}
          </ul>
        </li>
      ))}
    </ol>
  );
}
