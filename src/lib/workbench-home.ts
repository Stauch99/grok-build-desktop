import { parseSessionRefKey, sessionRefKey } from "./agent-id";

export function defaultWorkbenchHome(home: string): string {
  const trimmed = home.replace(/\/+$/, "");
  return `${trimmed}/.acp-workbench`;
}

export function workbenchJsonPath(wbHome: string): string {
  return `${wbHome}/workbench.json`;
}

export function grokWebuiPath(grokHome: string): string {
  return `${grokHome}/webui.json`;
}

export function shouldMigrateWebui(workbenchExists: boolean, grokWebuiExists: boolean): boolean {
  return !workbenchExists && grokWebuiExists;
}

export function migrateSessionKeyMap<T>(map: Record<string, T>): Record<string, T> {
  const out: Record<string, T> = {};
  for (const [key, value] of Object.entries(map)) {
    const ref = parseSessionRefKey(key);
    if (ref === null) continue;
    out[sessionRefKey(ref)] = value;
  }
  return out;
}

export function migrateWebuiSessionMaps(state: {
  pinned?: Record<string, unknown>;
  titles?: Record<string, unknown>;
  drafts?: Record<string, unknown>;
  archived?: Record<string, unknown>;
  unread?: Record<string, unknown>;
}): typeof state {
  const next = { ...state };
  if (next.pinned) next.pinned = migrateSessionKeyMap(next.pinned);
  if (next.titles) next.titles = migrateSessionKeyMap(next.titles);
  if (next.drafts) next.drafts = migrateSessionKeyMap(next.drafts);
  if (next.archived) next.archived = migrateSessionKeyMap(next.archived);
  if (next.unread) next.unread = migrateSessionKeyMap(next.unread);
  return next;
}
