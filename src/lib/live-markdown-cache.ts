import { renderMd } from "./markdown";

type CacheEntry = {
  text: string;
  cwd: string;
  html: string;
  renderedAt: number;
};

const entries = new Map<string, CacheEntry>();
const LIVE_THROTTLE_MS = 120;
const MAX_LIVE_CACHE = 16;

/**
 * Throttles full markdown parsing for streaming assistant turns.
 * While text grows at 60Hz from token chunks, full HTML parsing is only
 * performed every ~120ms or upon block completion (double newline), reusing
 * the intermediate HTML in between to eliminate UI frame drops.
 */
export function renderLiveMarkdownThrottled(
  id: string,
  md: string,
  cwd: string,
  toSrc: (path: string) => string,
  now = Date.now(),
): string {
  const existing = entries.get(id);
  if (
    existing &&
    existing.text === md &&
    existing.cwd === cwd
  ) {
    return existing.html;
  }

  // If text hasn't changed much and throttle period hasn't passed, reuse previous HTML
  if (
    existing &&
    existing.cwd === cwd &&
    now - existing.renderedAt < LIVE_THROTTLE_MS &&
    !md.endsWith("\n\n")
  ) {
    return existing.html;
  }

  const html = renderMd(md, cwd, toSrc);
  if (entries.size >= MAX_LIVE_CACHE) {
    const oldestKey = entries.keys().next().value;
    if (oldestKey !== undefined) entries.delete(oldestKey);
  }
  entries.set(id, { text: md, cwd, html, renderedAt: now });
  return html;
}

export function clearLiveMarkdownCache(): void {
  entries.clear();
}
