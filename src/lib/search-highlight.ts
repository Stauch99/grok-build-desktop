export type HighlightPart = { text: string; hit: boolean };

export function highlightQuery(text: string, query: string): HighlightPart[] {
  const q = query.trim();
  if (!q) return [{ text, hit: false }];
  const lower = text.toLowerCase();
  const needle = q.toLowerCase();
  const parts: HighlightPart[] = [];
  let from = 0;
  while (from < text.length) {
    const at = lower.indexOf(needle, from);
    if (at < 0) {
      parts.push({ text: text.slice(from), hit: false });
      break;
    }
    if (at > from) parts.push({ text: text.slice(from, at), hit: false });
    parts.push({ text: text.slice(at, at + q.length), hit: true });
    from = at + needle.length;
  }
  return parts.filter((p) => p.text.length > 0);
}

export function firstHitIndex(items: { id: string; text: string }[], query: string): string | null {
  const q = query.trim().toLowerCase();
  if (!q) return null;
  const hit = items.find((it) => it.text.toLowerCase().includes(q));
  return hit?.id ?? null;
}
