/**
 * Column sizing for the three-column shell.
 *
 * Invariant worth keeping: `SIDEBAR.min + PREVIEW.min + WORK_MIN` (840) must
 * stay below the window's `minWidth` in tauri.conf.json (880), so even the
 * smallest allowed window can show all three columns without overflowing.
 */
export type Bounds = { min: number; max: number; initial: number };

export const SIDEBAR: Bounds = { min: 200, max: 420, initial: 248 };
export const PREVIEW: Bounds = { min: 280, max: 720, initial: 420 };
/** The conversation column never shrinks past this, whatever the neighbours want. */
export const WORK_MIN = 360;

export function clamp(px: number, min: number, max: number): number {
  if (!Number.isFinite(px)) return min;
  return Math.round(Math.min(max, Math.max(min, px)));
}

/**
 * Effective upper bound for one side column, given the window and the other
 * side column. This is what stops a drag from squeezing the conversation into
 * nothing — the side panels yield to the middle, not the other way round.
 */
export function maxFor(bounds: Bounds, windowWidth: number, otherWidth: number): number {
  const room = windowWidth - otherWidth - WORK_MIN;
  return Math.max(bounds.min, Math.min(bounds.max, room));
}

export function clampSidebar(px: number, windowWidth: number, previewWidth = 0): number {
  return clamp(px, SIDEBAR.min, maxFor(SIDEBAR, windowWidth, previewWidth));
}

export function clampPreview(px: number, windowWidth: number, sidebarWidth = 0): number {
  return clamp(px, PREVIEW.min, maxFor(PREVIEW, windowWidth, sidebarWidth));
}

/**
 * Re-fit both columns after the window changes size. The preview gives ground
 * first because the sidebar is navigation you always need, while the preview is
 * a transient reading pane.
 */
export function fitLayout(
  sidebarWidth: number,
  previewWidth: number,
  windowWidth: number,
  previewOpen: boolean,
): { sidebar: number; preview: number } {
  const preview = previewOpen ? clampPreview(previewWidth, windowWidth, SIDEBAR.min) : previewWidth;
  const sidebar = clampSidebar(sidebarWidth, windowWidth, previewOpen ? preview : 0);
  const refit = previewOpen ? clampPreview(preview, windowWidth, sidebar) : preview;
  return { sidebar, preview: refit };
}

/** Read a persisted width, falling back to the default when it is absent or junk. */
export function loadWidth(raw: unknown, bounds: Bounds): number {
  if (typeof raw !== "number" || !Number.isFinite(raw)) return bounds.initial;
  return clamp(raw, bounds.min, bounds.max);
}
