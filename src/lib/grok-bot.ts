import { DEFAULT_ACCENT_ID, normalizeAccentId, type AccentId } from "./accent";

export type GrokBotShape = "triangle" | "cloud" | "pill" | "flower" | "drop" | "circle";

/** One design-pack silhouette per accent swatch. */
export const GROK_BOT_BY_ACCENT: Record<AccentId, GrokBotShape> = {
  blue: "triangle",
  orange: "cloud",
  green: "pill",
  purple: "flower",
  pink: "drop",
  teal: "circle",
};

export function grokBotShape(accent: unknown): GrokBotShape {
  return GROK_BOT_BY_ACCENT[normalizeAccentId(accent)];
}

type SourceEye = { cx: number; cy: number; w: number; h: number };

export type GrokBotEyeRect = {
  cx: number;
  cy: number;
  x: number;
  y: number;
  w: number;
  h: number;
  rx: number;
};

export type GrokBotBody =
  | { kind: "path"; d: string }
  | { kind: "circle"; cx: number; cy: number; r: number }
  | { kind: "pill"; x: number; y: number; w: number; h: number; rx: number }
  | { kind: "flower" };

export type GrokBotSpec = {
  shape: GrokBotShape;
  body: GrokBotBody;
  eyes: { left: SourceEye; right: SourceEye };
};

/** Shrink the shorter axis so every face reads as Grok-like vertical slits. */
export const GROK_BOT_EYE_WIDTH_SCALE = 0.42;
const MIN_SLIT_W = 12;

export const GROK_BOT_SPECS: Record<GrokBotShape, GrokBotSpec> = {
  drop: {
    shape: "drop",
    body: {
      kind: "path",
      d: "M100.5 1.8 C57.2 1.8 22.1 38.2 22.1 83.1 C22.1 128 57.2 198.1 100.5 198.1 C143.8 198.1 178.9 128 178.9 83.1 C178.9 38.2 143.8 1.8 100.5 1.8 Z",
    },
    eyes: {
      left: { cx: 55.1, cy: 88.5, w: 34.2, h: 68.9 },
      right: { cx: 102.4, cy: 89.2, w: 39.2, h: 67.9 },
    },
  },
  triangle: {
    shape: "triangle",
    body: {
      kind: "path",
      d: "M99.7 13.5 C95.2 13.5 91.0 15.8 88.7 19.6 L1.5 172.2 C-1.0 176.4 -0.9 181.6 1.7 185.7 C4.3 189.8 8.8 186.1 13.8 186.1 L185.6 186.1 C190.6 186.1 195.1 189.8 197.7 185.7 C200.3 181.6 200.4 176.4 197.9 172.2 L110.7 19.6 C108.4 15.8 104.2 13.5 99.7 13.5 Z",
    },
    eyes: {
      left: { cx: 76.6, cy: 117.1, w: 21.3, h: 48.5 },
      right: { cx: 122.1, cy: 117.1, w: 22.7, h: 48.5 },
    },
  },
  cloud: {
    shape: "cloud",
    body: {
      kind: "path",
      d: "M60 14 C30 14 1 35 1 65 C1 85 12 100 30 108 C12 116 1 131 1 151 C1 175 25 186 55 186 C75 186 92 178 100 165 C108 178 125 186 145 186 C175 186 199 175 199 151 C199 131 188 116 170 108 C188 100 199 85 199 65 C199 35 170 14 140 14 C120 14 103 22 100 35 C97 22 80 14 60 14 Z",
    },
    eyes: {
      left: { cx: 104.1, cy: 66.6, w: 47.3, h: 28.7 },
      right: { cx: 152.6, cy: 83.9, w: 43.4, h: 30.1 },
    },
  },
  circle: {
    shape: "circle",
    body: { kind: "circle", cx: 100.2, cy: 99.6, r: 98.4 },
    eyes: {
      left: { cx: 38.7, cy: 57.7, w: 35.5, h: 53.1 },
      right: { cx: 88.6, cy: 73.3, w: 40.2, h: 54.4 },
    },
  },
  pill: {
    shape: "pill",
    body: { kind: "pill", x: 0.4, y: 34.8, w: 199, h: 130.2, rx: 65.1 },
    eyes: {
      left: { cx: 68.4, cy: 77.7, w: 41.3, h: 66.5 },
      right: { cx: 131.8, cy: 80.8, w: 40.1, h: 60.8 },
    },
  },
  flower: {
    shape: "flower",
    body: { kind: "flower" },
    eyes: {
      left: { cx: 88, cy: 95, w: 18, h: 40 },
      right: { cx: 112, cy: 95, w: 18, h: 40 },
    },
  },
};

function round1(n: number): number {
  return Math.round(n * 10) / 10;
}

export function slitEye(source: SourceEye): GrokBotEyeRect {
  const h = Math.max(source.w, source.h);
  const w = Math.max(MIN_SLIT_W, round1(Math.min(source.w, source.h) * GROK_BOT_EYE_WIDTH_SCALE));
  return {
    cx: source.cx,
    cy: source.cy,
    w,
    h,
    rx: w / 2,
    x: -w / 2,
    y: -h / 2,
  };
}

export function grokBotEyes(shape: GrokBotShape = grokBotShape(DEFAULT_ACCENT_ID)): {
  left: GrokBotEyeRect;
  right: GrokBotEyeRect;
} {
  const spec = GROK_BOT_SPECS[shape];
  return { left: slitEye(spec.eyes.left), right: slitEye(spec.eyes.right) };
}

export function grokBotSpec(accent: unknown): GrokBotSpec {
  return GROK_BOT_SPECS[grokBotShape(accent)];
}
