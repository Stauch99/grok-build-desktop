export function tocActiveId(entries: ReadonlyArray<{ id: string; ratio: number }>): string | null {
  let best: { id: string; ratio: number } | null = null;
  for (const row of entries) {
    if (row.ratio <= 0) continue;
    if (!best || row.ratio > best.ratio) best = row;
  }
  return best?.id ?? null;
}
