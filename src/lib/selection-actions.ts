/** Pure logic for the Selection Actions toolbar (spec §6). */
import type { Locale } from "./i18n";

export interface Rect {
  top: number;
  left: number;
  width: number;
  height: number;
}

export interface Placement {
  x: number;
  y: number;
  flipped: boolean;
}

export const TOOLBAR_W = 220;
export const TOOLBAR_H = 36;
const EDGE_MARGIN = 8;

export function toolbarPlacement(
  sel: Rect,
  viewport: { width: number; height: number },
  toolbar: { width: number; height: number },
  gap = 8,
): Placement {
  const centered = sel.left + sel.width / 2 - toolbar.width / 2;
  const x = Math.min(
    Math.max(centered, EDGE_MARGIN),
    Math.max(EDGE_MARGIN, viewport.width - toolbar.width - EDGE_MARGIN),
  );
  const above = sel.top - toolbar.height - gap;
  const flipped = above < EDGE_MARGIN;
  const y = flipped ? sel.top + sel.height + gap : above;
  return { x, y, flipped };
}

export function formatQuote(text: string): string {
  return text
    .trim()
    .split("\n")
    .map((line) => `> ${line.trimEnd()}`)
    .join("\n");
}

export function composeRewriteDraft(quote: string, locale: Locale): string {
  const instruction = locale === "en" ? "Rewrite the passage above:" : "改写上面这段：";
  return `${quote}\n\n${instruction}`;
}

/** Toolbar state is published only after the pointer is up, so drag-select is not janked by React. */
export function shouldPublishSelectionToolbar(opts: { pointerDown: boolean }): boolean {
  return !opts.pointerDown;
}

export interface SelectionSnapshot {
  text: string;
  rect: Rect;
}

export function sameSelectionState(
  a: SelectionSnapshot | null,
  b: SelectionSnapshot | null,
): boolean {
  if (a === b) return true;
  if (!a || !b) return false;
  return (
    a.text === b.text &&
    a.rect.top === b.rect.top &&
    a.rect.left === b.rect.left &&
    a.rect.width === b.rect.width &&
    a.rect.height === b.rect.height
  );
}
