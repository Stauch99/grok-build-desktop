import { basename } from "./text";

export type MemoryChange = {
  path: string;
  mtime: number;
};

/** Newest first, unique by path. `now` drops future mtimes. */
export function selectRecent(
  changes: MemoryChange[],
  now: number,
  limit = 8,
): MemoryChange[] {
  const sorted = [...changes]
    .filter((c) => c.path && Number.isFinite(c.mtime) && c.mtime <= now)
    .sort((a, b) => b.mtime - a.mtime || a.path.localeCompare(b.path));
  const seen = new Set<string>();
  const out: MemoryChange[] = [];
  for (const c of sorted) {
    if (seen.has(c.path)) continue;
    seen.add(c.path);
    out.push(c);
    if (out.length >= limit) break;
  }
  return out;
}

export function formatMemoryLabel(path: string): string {
  return basename(path);
}

export function snapshotMtimes(changes: MemoryChange[]): Record<string, number> {
  const out: Record<string, number> = {};
  for (const c of changes) {
    if (c.path) out[c.path] = c.mtime;
  }
  return out;
}

/** Files that are new or newer than the last seen snapshot. */
export function detectMemoryUpdates(
  current: MemoryChange[],
  baseline: Record<string, number>,
  now: number,
): MemoryChange[] {
  return selectRecent(
    current.filter((c) => {
      const prev = baseline[c.path];
      return prev == null || c.mtime > prev;
    }),
    now,
  );
}
