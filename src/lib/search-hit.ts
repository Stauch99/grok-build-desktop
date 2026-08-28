export const SEARCH_HIT_MS = 2400;

/** Flash `search-hit` on `#turn-{id}` or `#msg-{id}` inside `el` for 2.4s. */
export function applySearchHit(el: ParentNode | null | undefined, id: string): () => void {
  const hit = el?.querySelector(`#turn-${id}, #msg-${id}`);
  hit?.classList.add("search-hit");
  const t = setTimeout(() => hit?.classList.remove("search-hit"), SEARCH_HIT_MS);
  return () => clearTimeout(t);
}
