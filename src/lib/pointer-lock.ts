export type HighlightInput = "keyboard" | "pointer";

/** Keyboard highlight stays put until the pointer actually moves. */
export function hoverMovesHighlight(source: HighlightInput): boolean {
  return source === "pointer";
}

export function pointerSourceFromMove(e: { movementX: number; movementY: number }): HighlightInput | null {
  return e.movementX !== 0 || e.movementY !== 0 ? "pointer" : null;
}
