const DRAFT_CAP = 20_000;

/** Composer draft key when no session is adopted yet. */
export const NONE_SESSION_KEY = "__none__";

export type SessionRailTabs = Record<string, string>;

/** Empty / missing session ids persist under `__none__`. */
export function draftKey(sessionId: string | null | undefined): string {
  return sessionId ? sessionId : NONE_SESSION_KEY;
}

/** Normalize a drafts map from storage (or empty). */
export function loadDrafts(raw?: Record<string, string>): Record<string, string> {
  if (!raw || typeof raw !== "object") return {};
  const out: Record<string, string> = {};
  for (const [id, text] of Object.entries(raw)) {
    if (typeof text !== "string" || !text) continue;
    const key = draftKey(id);
    out[key] = text.length > DRAFT_CAP ? text.slice(0, DRAFT_CAP) : text;
  }
  return out;
}

/** Set or clear a session draft. Empty text deletes the key. Caps at 20_000 chars. */
export function setDraft(
  map: Record<string, string>,
  sessionId: string | null | undefined,
  text: string,
): Record<string, string> {
  const next = { ...map };
  const key = draftKey(sessionId);
  const capped = text.length > DRAFT_CAP ? text.slice(0, DRAFT_CAP) : text;
  if (!capped) {
    delete next[key];
  } else {
    next[key] = capped;
  }
  return next;
}

export function getDraft(
  map: Record<string, string>,
  sessionId: string | null | undefined,
): string {
  return map[draftKey(sessionId)] ?? "";
}

/** After resume, keep an unlogged send in the composer; drop it if the log already has it. */
export function resumeComposerDraft(
  items: ReadonlyArray<{ kind: string; text: string }>,
  stored: string,
): string {
  if (!stored) return "";
  for (let i = items.length - 1; i >= 0; i--) {
    const it = items[i];
    if (it?.kind !== "user") continue;
    if (it.text === stored || it.text.endsWith(stored)) return "";
    return stored;
  }
  return stored;
}

export function setSessionRailTab(
  map: SessionRailTabs,
  sessionId: string,
  tab: string,
): SessionRailTabs {
  if (!sessionId || !tab) return map;
  if (map[sessionId] === tab) return map;
  return { ...map, [sessionId]: tab };
}

export function getSessionRailTab(
  map: SessionRailTabs,
  sessionId: string,
): string | undefined {
  return map[sessionId];
}
