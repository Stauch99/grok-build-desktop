import { parseSessionRefKey, sessionRefKey } from "./agent-id";

const DRAFT_CAP = 20_000;

/** Composer draft key when no session is adopted yet. */
export const NONE_SESSION_KEY = "__none__";

export type SessionRailTabs = Record<string, string>;

/** Empty / missing session ids persist under `grok/__none__`. Bare UUIDs share the grok/ slot. */
export function draftKey(sessionId: string | null | undefined): string {
  const ref = parseSessionRefKey(sessionId?.trim() || NONE_SESSION_KEY);
  if (!ref) return sessionRefKey({ agentId: "grok", sessionId: NONE_SESSION_KEY });
  return sessionRefKey(ref);
}

function draftAliases(sessionId: string | null | undefined): string[] {
  const key = draftKey(sessionId);
  const aliases = new Set<string>([key]);
  const ref = parseSessionRefKey(sessionId?.trim() || NONE_SESSION_KEY);
  if (ref) {
    aliases.add(ref.sessionId);
    aliases.add(sessionRefKey(ref));
  }
  if (!sessionId) aliases.add(NONE_SESSION_KEY);
  return [...aliases];
}

/** Normalize a drafts map from storage (or empty). */
export function loadDrafts(raw?: Record<string, string>): Record<string, string> {
  if (!raw || typeof raw !== "object") return {};
  const out: Record<string, string> = {};
  for (const [id, text] of Object.entries(raw)) {
    if (typeof text !== "string" || !text) continue;
    const key = draftKey(id);
    const brandedSource = id.includes("/");
    if (out[key] && !brandedSource) continue;
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
  for (const alias of draftAliases(sessionId)) delete next[alias];
  if (capped) next[key] = capped;
  return next;
}

export function getDraft(
  map: Record<string, string>,
  sessionId: string | null | undefined,
): string {
  const key = draftKey(sessionId);
  if (map[key]) return map[key];
  for (const alias of draftAliases(sessionId)) {
    if (map[alias]) return map[alias];
  }
  return "";
}

function loggedUserMatchesDraft(logged: string, stored: string): boolean {
  if (logged === stored || logged.endsWith(stored)) return true;
  const stripped = logged
    .replace(/^\s*<user_query>\s*/i, "")
    .replace(/\s*<\/user_query>\s*$/i, "");
  return stripped === stored || stripped.endsWith(stored);
}

/** After resume, keep an unlogged send in the composer; drop it if the log already has it. */
export function resumeComposerDraft(
  items: ReadonlyArray<{ kind: string; text?: string }>,
  stored: string,
): string {
  if (!stored) return "";
  for (let i = items.length - 1; i >= 0; i--) {
    const it = items[i];
    if (it?.kind !== "user") continue;
    const text = it.text ?? "";
    if (loggedUserMatchesDraft(text, stored)) return "";
    return stored;
  }
  return stored;
}

/** True when a controlled textarea echoes the just-sent prompt back into an empty composer. */
export function isStaleSentDraftChange(args: {
  next: string;
  lastSent: string;
  current: string;
}): boolean {
  return !!args.lastSent && args.current === "" && args.next === args.lastSent;
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
