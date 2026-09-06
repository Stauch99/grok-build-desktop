/** Keep the same row in view when the thread swaps virtual / plain lists. */
export function restoreVirtualScrollIndex(
  wasVirtual: boolean,
  nowVirtual: boolean,
  anchorIndex: number,
): number | null {
  if (wasVirtual === nowVirtual) return null;
  if (!Number.isFinite(anchorIndex) || anchorIndex < 0) return 0;
  return anchorIndex;
}
