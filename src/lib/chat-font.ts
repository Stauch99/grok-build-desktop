export type ChatFontId = "small" | "medium" | "regular";

export type ChatFontPreset = {
  id: ChatFontId;
  px: 14 | 15 | 17;
  labelKey: string;
};

export const CHAT_FONT_PRESETS: readonly ChatFontPreset[] = [
  { id: "small", px: 14, labelKey: "settings.fontSmall" },
  { id: "medium", px: 15, labelKey: "settings.fontMedium" },
  { id: "regular", px: 17, labelKey: "settings.fontRegular" },
];

export const DEFAULT_CHAT_FONT_SIZE = 17;

const PRESET_PX = CHAT_FONT_PRESETS.map((p) => p.px);

export function normalizeChatFontSize(raw: unknown): 14 | 15 | 17 {
  if (typeof raw !== "number" || !Number.isFinite(raw)) return DEFAULT_CHAT_FONT_SIZE;
  return PRESET_PX.reduce((best, px) =>
    Math.abs(px - raw) < Math.abs(best - raw) ? px : best,
  );
}
