import { applyChatUpdate, type ApplyOptions, type ChatState } from "./chat";
import { asRecord } from "./text";

const FLUSH_NOW = new Set([
  "turn_completed",
  "auto_compact_started",
  "auto_compact_completed",
]);

export function foldSessionUpdates(
  prev: ChatState,
  batch: Record<string, unknown>[],
  opts?: ApplyOptions,
): ChatState {
  if (batch.length === 0) return prev;
  return batch.reduce((chat, params) => applyChatUpdate(chat, params, opts), prev);
}

export function shouldFlushSessionUpdateNow(params: Record<string, unknown>): boolean {
  const update = params.update ? asRecord(params.update) : params;
  return FLUSH_NOW.has(String(update.sessionUpdate ?? ""));
}

/** One animation frame, or a microtask when rAF is missing (Node tests). */
export function scheduleSessionUpdateFlush(apply: () => void): () => void {
  if (typeof requestAnimationFrame === "function") {
    const id = requestAnimationFrame(() => apply());
    return () => cancelAnimationFrame(id);
  }
  let cancelled = false;
  queueMicrotask(() => {
    if (!cancelled) apply();
  });
  return () => {
    cancelled = true;
  };
}
