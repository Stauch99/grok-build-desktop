import type { ChatItem } from "./chat";

/**
 * Queue echoes: queuePrompt appends a local user bubble at enqueue time, so when
 * the queue later drains through sendPrompt the same text must not be bubbled
 * again. The marker lives in this side table (not on QueueState) so it can also
 * verify the bubble survived — a session reload rebuilds items from disk and
 * drops local echoes, in which case the drain must echo again.
 * Key: pane scope (main/<draftKey> or pane/<id>) -> trimmed text -> count.
 */
export type QueuedEchoes = Map<string, Map<string, number>>;

const LOCAL_ECHO_ID = /^u-(?:local|queue|steer)-/;

export function noteQueuedEcho(map: QueuedEchoes, key: string, text: string): void {
  const norm = text.trim();
  if (!norm) return;
  const bucket = map.get(key) ?? new Map<string, number>();
  bucket.set(norm, (bucket.get(norm) ?? 0) + 1);
  map.set(key, bucket);
}

/** Consume one recorded echo; true when this send was already bubbled at enqueue. */
export function takeQueuedEcho(map: QueuedEchoes, key: string, text: string): boolean {
  const norm = text.trim();
  const bucket = map.get(key);
  const left = (bucket?.get(norm) ?? 0) - 1;
  if (left < 0) return false;
  if (left === 0) bucket!.delete(norm);
  else bucket!.set(norm, left);
  if (bucket && bucket.size === 0) map.delete(key);
  return true;
}

/** A local echo bubble (u-local/u-queue/u-steer) with this text is still in the chat. */
export function hasLocalUserEcho(items: readonly ChatItem[], text: string): boolean {
  const norm = text.trim();
  return items.some(
    (it) => it.kind === "user" && LOCAL_ECHO_ID.test(it.id) && it.text.trim() === norm,
  );
}

export function clearQueuedEchoes(map: QueuedEchoes, key: string): void {
  map.delete(key);
}
