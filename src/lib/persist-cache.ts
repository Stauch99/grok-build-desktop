export const WEBUI_PERSIST_MS = 500;
export const WORKSPACE_WATCH_DEBOUNCE_MS = 300;
export const GIT_FALLBACK_MS = 30_000;

export const WATCH_IGNORE = ["node_modules", ".git", "target", "dist", ".next"] as const;

export type MtimeCache<T> = { mtime: number; value: T };

export function cacheStore<T>(mtime: number, value: T): MtimeCache<T> {
  return { mtime, value };
}

export function cacheHit<T>(cache: MtimeCache<T> | null | undefined, mtime: number): T | undefined {
  if (cache && cache.mtime === mtime) return cache.value;
  return undefined;
}

export function shouldSkipSave(previous: string | null | undefined, next: string): boolean {
  return previous === next;
}

export function watchPathIgnored(path: string, ignore: readonly string[] = WATCH_IGNORE): boolean {
  const parts = path.split(/[\\/]+/);
  return ignore.some((name) => parts.includes(name));
}
