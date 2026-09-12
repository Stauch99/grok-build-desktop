import { useCallback, useEffect, useMemo, useState } from "react";
import {
  listSessions,
  readMemoryActivity,
  readMemoryEvents,
  type MemoryActivityDay,
  type MemoryEventRow,
} from "../api";
import {
  companionsDays,
  heatmapGrid,
  mergeTimeline,
  streakDays,
  type HeatMetric,
} from "../lib/memory-growth";
import { localDayStamp } from "../lib/memory-clock";
import type { DiaryEntry } from "../lib/memory-view";

export function useMemoryGrowth(opts: { diary: DiaryEntry[]; extraOpen: boolean }) {
  const [days, setDays] = useState<MemoryActivityDay[]>([]);
  const [earliestDay, setEarliestDay] = useState<string | null>(null);
  const [events, setEvents] = useState<MemoryEventRow[]>([]);
  const [sessionsTotal, setSessionsTotal] = useState(0);
  const [metric, setMetric] = useState<HeatMetric>("intimacy");
  const [selectedDay, setSelectedDay] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);

  const reload = useCallback(async () => {
    setLoading(true);
    try {
      const [activity, ev, sessions] = await Promise.all([
        readMemoryActivity().catch(() => ({ days: [], earliestDay: null })),
        readMemoryEvents().catch(() => [] as MemoryEventRow[]),
        listSessions(null).catch(() => []),
      ]);
      setDays(activity.days ?? []);
      setEarliestDay(activity.earliestDay ?? null);
      setEvents(ev);
      setSessionsTotal(sessions.length);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    if (!opts.extraOpen) return;
    void reload();
  }, [opts.extraOpen, reload]);

  const tz = useMemo(() => Intl.DateTimeFormat().resolvedOptions().timeZone, []);
  const today = useMemo(() => localDayStamp(Date.now(), tz), [tz]);
  const grid = useMemo(() => heatmapGrid(today, days, metric), [today, days, metric]);
  const timeline = useMemo(() => mergeTimeline(events, opts.diary, tz), [events, opts.diary, tz]);
  const companions = useMemo(() => companionsDays(earliestDay, today), [earliestDay, today]);
  const streak = useMemo(() => streakDays(days, today), [days, today]);
  const empty = days.every((d) => d.dailyLines + d.mcpAppends + d.newSessions + d.promoted + d.memBytes === 0)
    && events.length === 0
    && opts.diary.length === 0;

  return {
    metric,
    setMetric,
    selectedDay,
    setSelectedDay,
    grid,
    timeline,
    companions,
    streak,
    sessionsTotal,
    loading,
    empty,
    today,
    reload,
  };
}
