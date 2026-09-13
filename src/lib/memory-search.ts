/**
 * Full-text search over the memory-growth page: diary entries, timeline
 * days/events and the project file rows. Matching is case-insensitive
 * substring via `highlightQuery` so the same pass both filters and marks.
 */
import type { TimelineDay, TimelineEvent } from "./memory-growth";
import type { DiaryEntry } from "./memory-view";
import { highlightQuery } from "./search-highlight";

/** Number of non-overlapping case-insensitive hits of `query` in `text`. */
export function countHits(text: string, query: string): number {
  const q = query.trim();
  if (!q) return 0;
  return highlightQuery(text, q).reduce((n, p) => n + (p.hit ? 1 : 0), 0);
}

export function diaryEntryHit(entry: DiaryEntry, query: string): boolean {
  return countHits(entry.date, query) + countHits(entry.body, query) > 0;
}

export function filterDiary(entries: readonly DiaryEntry[], query: string): DiaryEntry[] {
  const q = query.trim();
  if (!q) return [...entries];
  return entries.filter((e) => diaryEntryHit(e, q));
}

export function timelineEventHit(
  ev: TimelineEvent,
  query: string,
  labelFor: (ev: TimelineEvent) => string,
): boolean {
  return countHits(labelFor(ev), query) > 0;
}

/**
 * Keep days matching by date or containing a matching event. A day hit by
 * date keeps all its events; otherwise events narrow to the hits.
 */
export function filterTimeline(
  days: readonly TimelineDay[],
  query: string,
  labelFor: (ev: TimelineEvent) => string,
): TimelineDay[] {
  const q = query.trim();
  if (!q) return [...days];
  const out: TimelineDay[] = [];
  for (const day of days) {
    const dayHit = countHits(day.day, q) > 0;
    const events = dayHit
      ? day.events
      : day.events.filter((ev) => timelineEventHit(ev, q, labelFor));
    if (dayHit || events.length) out.push({ ...day, events });
  }
  return out;
}

/** Total hit count across everything the page renders — for the search chip. */
export function memorySearchHits(opts: {
  diary: readonly DiaryEntry[];
  days: readonly TimelineDay[];
  files: readonly { heading: string; path: string }[];
  query: string;
  labelFor: (ev: TimelineEvent) => string;
}): number {
  const q = opts.query.trim();
  if (!q) return 0;
  let n = 0;
  for (const e of opts.diary) n += countHits(`${e.date}\n${e.body}`, q);
  for (const day of opts.days) {
    n += countHits(day.day, q);
    for (const ev of day.events) n += countHits(opts.labelFor(ev), q);
  }
  for (const f of opts.files) n += countHits(`${f.heading} ${f.path}`, q);
  return n;
}
