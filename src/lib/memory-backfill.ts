import { memoryCursorKey } from "./memory-clock";
import type { DreamTrigger } from "./memory-gates";

/** Max ingest+dream rounds in one manual / first-launch catch-up. */
export const BACKFILL_MAX_SWEEPS = 5;

export function nextBackfillAction(input: {
  sweepsDone: number;
  stoppedEarly: boolean;
  pending: number;
  lastReason?: string;
}): "again" | "stop" {
  if (input.sweepsDone >= BACKFILL_MAX_SWEEPS) return "stop";
  if (input.lastReason === "blocked-login" || input.lastReason === "failed") return "stop";
  if (input.stoppedEarly || input.pending > 0) return "again";
  return "stop";
}

export function backfillEligible(trigger: DreamTrigger, lastDeepAt: number | null): boolean {
  if (trigger === "manual") return true;
  return trigger === "launch" && lastDeepAt === null;
}

export function unconsumedPageCount(
  pages: readonly { sessionId: string; nextByte: number }[],
  cursors: Record<string, number>,
  forgotten: readonly string[] = [],
): number {
  const skip = new Set(forgotten);
  let count = 0;
  for (const page of pages) {
    if (skip.has(page.sessionId)) continue;
    const cursor = cursors[memoryCursorKey("grok", page.sessionId)] ?? 0;
    if (page.nextByte > cursor) count += 1;
  }
  return count;
}
