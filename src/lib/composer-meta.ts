/** Optional meta-row slots, omitted first when the composer is too narrow. */
export type ComposerMetaSlot = "cwd" | "stats" | "ring";

export type ComposerMetaHide = Record<ComposerMetaSlot, boolean>;

export type ComposerMetaSizes = {
  available: number;
  cwd: number;
  stats: number;
  ring: number;
  /** Mode / model / effort chips plus any lead actions that must stay. */
  keep: number;
  gap?: number;
  columnGap?: number;
};

export const COMPOSER_META_GAP = 8;
export const COMPOSER_META_COLUMN_GAP = 12;

const NONE: ComposerMetaHide = { cwd: false, stats: false, ring: false };

function pack(parts: number[], gap: number): number {
  const shown = parts.filter((n) => n > 0);
  if (shown.length === 0) return 0;
  return shown.reduce((a, b) => a + b, 0) + (shown.length - 1) * gap;
}

export function composerMetaWidth(s: ComposerMetaSizes, hide: ComposerMetaHide): number {
  const gap = s.gap ?? COMPOSER_META_GAP;
  const columnGap = s.columnGap ?? COMPOSER_META_COLUMN_GAP;
  const left = pack([hide.cwd ? 0 : s.cwd, hide.stats ? 0 : s.stats], gap);
  const right = pack([s.keep, hide.ring ? 0 : s.ring], gap);
  return left + right + (left > 0 && right > 0 ? columnGap : 0);
}

/**
 * Hide project name, then stats, then the context ring, until the row fits.
 * Mode / model / effort (`keep`) always stay.
 */
export function composerMetaHide(s: ComposerMetaSizes): ComposerMetaHide {
  const hide: ComposerMetaHide = { ...NONE };
  if (composerMetaWidth(s, hide) <= s.available) return hide;
  if (s.cwd > 0) {
    hide.cwd = true;
    if (composerMetaWidth(s, hide) <= s.available) return hide;
  }
  if (s.stats > 0) {
    hide.stats = true;
    if (composerMetaWidth(s, hide) <= s.available) return hide;
  }
  if (s.ring > 0) hide.ring = true;
  return hide;
}

export function sameMetaHide(a: ComposerMetaHide, b: ComposerMetaHide): boolean {
  return a.cwd === b.cwd && a.stats === b.stats && a.ring === b.ring;
}
