/**
 * Per-session scratch notes. Persisted in localStorage (per-window chrome,
 * like the sidebar prefs in sidebar-local.ts), capped at ~500 characters per
 * note and ~200 entries with LRU eviction — the oldest-touched entry drops
 * first so the map cannot grow without bound.
 */
import { storageGetJson, storageSet } from "./sidebar-local";

export const SESSION_NOTES_KEY = "grok.sessionNotes";
export const NOTE_MAX_CHARS = 500;
export const NOTES_MAX_ENTRIES = 200;

/** Normalize a persisted payload: string values only, capped, order kept. */
export function loadSessionNotes(raw: unknown): Record<string, string> {
  const out: Record<string, string> = {};
  if (!raw || typeof raw !== "object" || Array.isArray(raw)) return out;
  for (const [id, text] of Object.entries(raw as Record<string, unknown>)) {
    if (!id || typeof text !== "string" || !text) continue;
    out[id] = text.length > NOTE_MAX_CHARS ? text.slice(0, NOTE_MAX_CHARS) : text;
  }
  return out;
}

function readMap(): Record<string, string> {
  return loadSessionNotes(storageGetJson(SESSION_NOTES_KEY));
}

/** The note for one session, or "" when there is none. */
export function getSessionNote(id: string | null | undefined): string {
  if (!id) return "";
  return readMap()[id] ?? "";
}

/**
 * Set or clear the note for one session. Empty text removes the entry.
 * Setting a note marks it most-recently-used; once the map exceeds
 * NOTES_MAX_ENTRIES the least-recently-used entries are evicted.
 * Returns the stored text ("" when cleared).
 */
export function setSessionNote(id: string, text: string): string {
  if (!id) return "";
  const map = readMap();
  delete map[id];
  const capped = text.length > NOTE_MAX_CHARS ? text.slice(0, NOTE_MAX_CHARS) : text;
  if (capped) map[id] = capped;
  const keys = Object.keys(map);
  while (keys.length > NOTES_MAX_ENTRIES) {
    const oldest = keys.shift();
    if (!oldest) break;
    delete map[oldest];
  }
  storageSet(SESSION_NOTES_KEY, JSON.stringify(map));
  return capped;
}
