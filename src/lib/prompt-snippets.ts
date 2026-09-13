/**
 * Prompt snippets: small reusable prompt bodies stored in localStorage under
 * `grok.snippets`. Newest last. The storage arg is injectable for tests.
 */

export type PromptSnippet = { id: string; title: string; body: string };

export const SNIPPETS_KEY = "grok.snippets";
export const SNIPPET_CAP = 50;

export type SnippetStorage = Pick<Storage, "getItem" | "setItem">;

function defaultStorage(): SnippetStorage | null {
  try {
    return typeof window === "undefined" ? null : window.localStorage;
  } catch {
    return null;
  }
}

function sanitize(raw: unknown): PromptSnippet[] {
  if (!Array.isArray(raw)) return [];
  const out: PromptSnippet[] = [];
  for (const item of raw) {
    if (!item || typeof item !== "object") continue;
    const { id, title, body } = item as Record<string, unknown>;
    if (typeof id !== "string" || !id) continue;
    if (typeof title !== "string" || !title.trim()) continue;
    if (typeof body !== "string" || !body.trim()) continue;
    out.push({ id, title, body });
  }
  return out.slice(0, SNIPPET_CAP);
}

/** Read all snippets. Missing or corrupt JSON reads as an empty list. */
export function listSnippets(store: SnippetStorage | null = defaultStorage()): PromptSnippet[] {
  if (!store) return [];
  try {
    return sanitize(JSON.parse(store.getItem(SNIPPETS_KEY) ?? "[]"));
  } catch {
    return [];
  }
}

function writeSnippets(list: PromptSnippet[], store: SnippetStorage): void {
  store.setItem(SNIPPETS_KEY, JSON.stringify(list));
}

let seq = 0;
function snippetId(now = Date.now()): string {
  seq = (seq + 1) % 0xffff;
  return `s${now.toString(36)}-${seq.toString(36)}`;
}

/** Create a snippet. Returns null for blank input, a full box, or no storage. */
export function saveSnippet(
  title: string,
  body: string,
  store: SnippetStorage | null = defaultStorage(),
): PromptSnippet | null {
  const name = title.trim();
  if (!store || !name || !body.trim()) return null;
  const list = listSnippets(store);
  if (list.length >= SNIPPET_CAP) return null;
  const snippet: PromptSnippet = { id: snippetId(), title: name, body };
  writeSnippets([...list, snippet], store);
  return snippet;
}

/** Patch title/body of an existing snippet. Returns the list, or null when the id is unknown or the patch is blank. */
export function updateSnippet(
  id: string,
  patch: { title?: string; body?: string },
  store: SnippetStorage | null = defaultStorage(),
): PromptSnippet[] | null {
  if (!store) return null;
  const list = listSnippets(store);
  const index = list.findIndex((s) => s.id === id);
  if (index < 0) return null;
  const current = list[index]!;
  const title = patch.title !== undefined ? patch.title.trim() : current.title;
  const body = patch.body !== undefined ? patch.body : current.body;
  if (!title || !body.trim()) return null;
  const next = [...list];
  next[index] = { id, title, body };
  writeSnippets(next, store);
  return next;
}

/** Remove a snippet by id. Returns the remaining list. */
export function deleteSnippet(
  id: string,
  store: SnippetStorage | null = defaultStorage(),
): PromptSnippet[] {
  if (!store) return [];
  const next = listSnippets(store).filter((s) => s.id !== id);
  writeSnippets(next, store);
  return next;
}
