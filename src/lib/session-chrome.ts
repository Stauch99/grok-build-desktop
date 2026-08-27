import type { SessionSummary } from "../api";

export function toggleId(list: string[], id: string): string[] {
  return list.includes(id) ? list.filter((x) => x !== id) : [...list, id];
}

export function isPinned(pinned: string[], id: string): boolean {
  return pinned.includes(id);
}

export function isArchived(archived: string[], id: string): boolean {
  return archived.includes(id);
}

const DAY_MS = 24 * 60 * 60 * 1000;

function isStale(
  updatedAt: string,
  autoArchiveDays: number,
  now: number,
): boolean {
  if (autoArchiveDays <= 0) return false;
  const t = Date.parse(updatedAt);
  if (Number.isNaN(t)) return false;
  return t < now - autoArchiveDays * DAY_MS;
}

export type VisibleSessionsOpts = {
  pinned: string[];
  archived: string[];
  view: "active" | "archived";
  autoArchiveDays: number;
  now: number;
};

export function visibleSessions(
  sessions: SessionSummary[],
  opts: VisibleSessionsOpts,
): SessionSummary[] {
  const { pinned, archived, view, autoArchiveDays, now } = opts;
  return sessions.filter((s) => {
    if (s.numMessages === 0) return false;
    const archivedId = isArchived(archived, s.id);
    const auto =
      !isPinned(pinned, s.id) && isStale(s.updatedAt, autoArchiveDays, now);
    if (view === "active") {
      if (archivedId) return false;
      if (auto) return false;
      return true;
    }
    return archivedId || auto;
  });
}

export function partitionPinned(
  sessions: SessionSummary[],
  pinnedIds: string[],
): { pinned: SessionSummary[]; rest: SessionSummary[] } {
  const pinSet = new Set(pinnedIds);
  const pinned: SessionSummary[] = [];
  const rest: SessionSummary[] = [];
  for (const s of sessions) {
    if (pinSet.has(s.id)) pinned.push(s);
    else rest.push(s);
  }
  return { pinned, rest };
}

export function shouldAutoExpand(
  _parentId: string,
  activeId: string | null | undefined,
  childrenIds: string[],
): boolean {
  if (!activeId) return false;
  return childrenIds.includes(activeId);
}
