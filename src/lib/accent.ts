export const DEFAULT_ACCENT_ID = "blue" as const;

export const ACCENT_PRESETS = [
  { id: "blue", hex: "#0078FC", labelKey: "settings.accentBlue" },
  { id: "orange", hex: "#FC7800", labelKey: "settings.accentOrange" },
  { id: "green", hex: "#00C06C", labelKey: "settings.accentGreen" },
  { id: "purple", hex: "#6C48FC", labelKey: "settings.accentPurple" },
  { id: "pink", hex: "#F0549C", labelKey: "settings.accentPink" },
  { id: "teal", hex: "#00C0CC", labelKey: "settings.accentTeal" },
] as const;

export type AccentId = (typeof ACCENT_PRESETS)[number]["id"];

const ACCENT_IDS = new Set<string>(ACCENT_PRESETS.map((row) => row.id));
const HEX_BY_ID = Object.fromEntries(ACCENT_PRESETS.map((row) => [row.id, row.hex])) as Record<AccentId, string>;

export function normalizeAccentId(value: unknown): AccentId {
  return typeof value === "string" && ACCENT_IDS.has(value) ? (value as AccentId) : DEFAULT_ACCENT_ID;
}

export function accentHex(id: unknown): string {
  return HEX_BY_ID[normalizeAccentId(id)];
}

export type AccentTarget = {
  style: { setProperty(name: string, value: string): void };
  dataset: { accent?: string };
};

export function applyAccent(target: AccentTarget, id: unknown): AccentId {
  const next = normalizeAccentId(id);
  target.style.setProperty("--brand", accentHex(next));
  target.dataset.accent = next;
  return next;
}
