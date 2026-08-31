export const PALETTE_FRECENCY_KEY = "grok.palette.frecency";

export type FrecencyEntry = { uses: number; lastAt: number };
export type FrecencyMap = Record<string, FrecencyEntry>;

type FrecencyReader = Pick<Storage, "getItem">;
type FrecencyWriter = Pick<Storage, "setItem">;
type FrecencyStorage = FrecencyReader & FrecencyWriter;

export function frecencyScore(uses: number, lastAt: number, now: number): number {
  return uses / (1 + (now - lastAt) / 86_400_000);
}

export function bumpFrecency(store: FrecencyMap, id: string, now: number): FrecencyMap {
  const prev = store[id];
  return { ...store, [id]: { uses: (prev?.uses ?? 0) + 1, lastAt: now } };
}

export function loadPaletteFrecency(storage: FrecencyReader): FrecencyMap {
  const raw = storage.getItem(PALETTE_FRECENCY_KEY);
  if (!raw) return {};
  try {
    const parsed = JSON.parse(raw) as unknown;
    if (!parsed || typeof parsed !== "object" || Array.isArray(parsed)) return {};
    return parsed as FrecencyMap;
  } catch {
    return {};
  }
}

export function savePaletteFrecency(store: FrecencyMap, storage: FrecencyWriter): void {
  storage.setItem(PALETTE_FRECENCY_KEY, JSON.stringify(store));
}

export function recordPaletteUse(id: string, now: number, storage: FrecencyStorage): FrecencyMap {
  const next = bumpFrecency(loadPaletteFrecency(storage), id, now);
  savePaletteFrecency(next, storage);
  return next;
}

export function loadLocalPaletteFrecency(): FrecencyMap {
  try {
    if (typeof localStorage === "undefined") return {};
    return loadPaletteFrecency(localStorage);
  } catch {
    return {};
  }
}

export function recordLocalPaletteUse(id: string, now = Date.now()): FrecencyMap {
  try {
    if (typeof localStorage === "undefined") return {};
    return recordPaletteUse(id, now, localStorage);
  } catch {
    return {};
  }
}
