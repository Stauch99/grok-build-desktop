export type ChatWidthId = "narrow" | "medium" | "wide" | "fill";

export type ChatWidthPreset = {
  id: ChatWidthId;
  px: 560 | 680 | 860 | 0;
  labelKey: string;
};

export const CHAT_WIDTH_FILL = 0;

export const CHAT_WIDTH_PRESETS: readonly ChatWidthPreset[] = [
  { id: "narrow", px: 560, labelKey: "settings.widthNarrow" },
  { id: "medium", px: 680, labelKey: "settings.widthMedium" },
  { id: "wide", px: 860, labelKey: "settings.widthWide" },
  { id: "fill", px: CHAT_WIDTH_FILL, labelKey: "settings.widthFill" },
];

export const DEFAULT_CHAT_WIDTH = 680;

const SNAP_PX = [560, 680, 860] as const;

export function normalizeChatWidth(raw: unknown): 560 | 680 | 860 | 0 {
  if (raw === 0 || raw === "fill") return CHAT_WIDTH_FILL;
  if (typeof raw !== "number" || !Number.isFinite(raw)) return DEFAULT_CHAT_WIDTH;
  return SNAP_PX.reduce((best, px) =>
    Math.abs(px - raw) < Math.abs(best - raw) ? px : best,
  );
}

export function chatWidthCss(raw: unknown): string {
  const px = normalizeChatWidth(raw);
  return px === CHAT_WIDTH_FILL ? "100%" : `${px}px`;
}
