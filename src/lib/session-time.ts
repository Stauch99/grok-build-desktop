/** Parse mixed CLI timestamps to epoch ms. 0 means unknown. */
export function updatedAtMs(raw: string | undefined | null): number {
  const s = (raw ?? "").trim();
  if (!s) return 0;
  if (/^\d+$/.test(s)) {
    const n = Number(s);
    if (!Number.isFinite(n) || n <= 0) return 0;
    return n < 1e12 ? n * 1000 : n;
  }
  const iso = Date.parse(s);
  return Number.isNaN(iso) ? 0 : iso;
}

export function compareByUpdatedAtDesc(
  a: { id: string; updatedAt: string },
  b: { id: string; updatedAt: string },
): number {
  const dt = updatedAtMs(b.updatedAt) - updatedAtMs(a.updatedAt);
  if (dt !== 0) return dt;
  return a.id.localeCompare(b.id);
}
