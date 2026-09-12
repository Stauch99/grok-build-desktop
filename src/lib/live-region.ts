export const LIVE_REGION_MS = 1000;

export type LiveItem = { kind: string; text?: string };

/** Newest assistant turn, for the polite live region. */
export function latestAssistantText(items: LiveItem[]): string {
  for (let i = items.length - 1; i >= 0; i--) {
    const item = items[i];
    if (item.kind === "assistant" && item.text) return item.text;
  }
  return "";
}

export type LiveRegionClock = { announced: string; lastAt: number };

/** Publish at most once per second unless `flush` (stream ended). */
export function publishLiveText(
  clock: LiveRegionClock,
  latest: string,
  now: number,
  opts?: { flush?: boolean; intervalMs?: number },
): LiveRegionClock {
  if (latest === clock.announced) return clock;
  const interval = opts?.intervalMs ?? LIVE_REGION_MS;
  if (!opts?.flush && clock.lastAt > 0 && now - clock.lastAt < interval) return clock;
  return { announced: latest, lastAt: now };
}
