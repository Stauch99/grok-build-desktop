const DRAFT_CAP = 20_000;

/** Normalize a drafts map from storage (or empty). */
export function loadDrafts(raw?: Record<string, string>): Record<string, string> {
  if (!raw || typeof raw !== "object") return {};
  const out: Record<string, string> = {};
  for (const [id, text] of Object.entries(raw)) {
    if (typeof text !== "string" || !text) continue;
    out[id] = text.length > DRAFT_CAP ? text.slice(0, DRAFT_CAP) : text;
  }
  return out;
}

/** Set or clear a session draft. Empty text deletes the key. Caps at 20_000 chars. */
export function setDraft(
  map: Record<string, string>,
  sessionId: string,
  text: string,
): Record<string, string> {
  const next = { ...map };
  const capped = text.length > DRAFT_CAP ? text.slice(0, DRAFT_CAP) : text;
  if (!capped) {
    delete next[sessionId];
  } else {
    next[sessionId] = capped;
  }
  return next;
}

export function getDraft(map: Record<string, string>, sessionId: string): string {
  return map[sessionId] ?? "";
}
