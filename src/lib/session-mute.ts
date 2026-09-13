/**
 * Per-session notification mute. The muted set lives in localStorage —
 * it is per-window chrome, not webui state — and every mutation notifies
 * in-page listeners so badge counts and menus refresh without a reload.
 */
import { storageGetJson, storageSet } from "./sidebar-local";

export const SESSION_MUTE_KEY = "grok.sessionMute";

/** Normalize a persisted payload into a muted-id set (junk tolerated). */
export function loadMutedIds(raw: unknown): Set<string> {
  const out = new Set<string>();
  if (!Array.isArray(raw)) return out;
  for (const id of raw) {
    if (typeof id === "string" && id) out.add(id);
  }
  return out;
}

/** Read the current muted set. Cheap: one localStorage read per call. */
export function mutedIds(): Set<string> {
  return loadMutedIds(storageGetJson(SESSION_MUTE_KEY));
}

/** True when notifications for `id` are muted. Null/empty ids are never muted. */
export function isSessionMuted(id: string | null | undefined): boolean {
  if (!id) return false;
  return mutedIds().has(id);
}

const listeners = new Set<() => void>();

/** Subscribe to mute changes made through this module. Returns unsubscribe. */
export function onSessionMuteChange(listener: () => void): () => void {
  listeners.add(listener);
  return () => {
    listeners.delete(listener);
  };
}

function emit() {
  for (const listener of listeners) listener();
}

/** Persist `ids` and notify listeners. Returns the normalized set. */
export function saveMutedIds(ids: Iterable<string>): Set<string> {
  const next = loadMutedIds([...ids]);
  storageSet(SESSION_MUTE_KEY, JSON.stringify([...next]));
  emit();
  return next;
}

/** Set or clear the mute flag for one session. Returns the updated set. */
export function setSessionMuted(id: string, muted: boolean): Set<string> {
  const next = mutedIds();
  if (muted) next.add(id);
  else next.delete(id);
  return saveMutedIds(next);
}

/** Flip the mute flag for one session. Returns the new muted state. */
export function toggleSessionMuted(id: string): boolean {
  const next = !isSessionMuted(id);
  setSessionMuted(id, next);
  return next;
}
