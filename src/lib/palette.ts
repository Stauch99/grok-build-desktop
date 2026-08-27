export type PaletteGroup = "操作" | "会话" | "项目" | "命令";

export type PaletteItem = {
  id: string;
  label: string;
  hint?: string;
  group: PaletteGroup;
};

const GROUP_ORDER: PaletteGroup[] = ["操作", "会话", "项目", "命令"];

function subsequence(haystack: string, needle: string): boolean {
  let i = 0;
  for (const ch of haystack) {
    if (ch === needle[i]) i++;
    if (i === needle.length) return true;
  }
  return needle.length === 0;
}

/**
 * Higher is better. `null` means no match.
 * Prefix beats substring beats subsequence; a hint match always ranks below
 * any label match so typing a session name never surfaces a command first.
 */
export function scoreItem(item: PaletteItem, query: string): number | null {
  const q = query.trim().toLowerCase();
  if (!q) return 0;
  const label = item.label.toLowerCase();
  if (label.startsWith(q)) return 1000 - label.length;
  const at = label.indexOf(q);
  if (at >= 0) return 600 - at;
  const hint = (item.hint ?? "").toLowerCase();
  if (hint.includes(q)) return 200;
  if (subsequence(label, q)) return 100;
  return null;
}

export function filterPalette(
  items: PaletteItem[],
  query: string,
  limit = 40,
): PaletteItem[] {
  const scored: { item: PaletteItem; score: number; order: number }[] = [];
  items.forEach((item, order) => {
    const score = scoreItem(item, query);
    if (score === null) return;
    scored.push({ item, score, order });
  });
  const q = query.trim();
  scored.sort((a, b) => {
    if (!q) {
      const g = GROUP_ORDER.indexOf(a.item.group) - GROUP_ORDER.indexOf(b.item.group);
      if (g !== 0) return g;
      return a.order - b.order;
    }
    if (b.score !== a.score) return b.score - a.score;
    return a.order - b.order;
  });
  return scored.slice(0, limit).map((s) => s.item);
}

export function paletteSubmit(
  query: string,
  hits: PaletteItem[],
  index: number,
): { kind: "pick"; id: string } | { kind: "search"; query: string } | { kind: "none" } {
  const hit = hits[index];
  if (hit) return { kind: "pick", id: hit.id };
  const q = query.trim();
  if (q.length >= 2) return { kind: "search", query: q };
  return { kind: "none" };
}

/** Clamp the highlighted row when the filtered list shrinks. */
export function clampIndex(index: number, length: number): number {
  if (length <= 0) return 0;
  if (index < 0) return length - 1;
  if (index >= length) return 0;
  return index;
}
