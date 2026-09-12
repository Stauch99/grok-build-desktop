/** Keep the same row in view when the thread swaps virtual / plain lists. */
export function restoreVirtualScrollIndex(
  wasVirtual: boolean,
  nowVirtual: boolean,
  anchorIndex: number,
  pinToLatest = false,
): number | null {
  if (wasVirtual === nowVirtual) return null;
  if (pinToLatest) return null;
  if (!Number.isFinite(anchorIndex) || anchorIndex < 0) return 0;
  return anchorIndex;
}

/** Open / follow-the-latest should land on the last row, not the top. */
export function latestThreadRowIndex(rowCount: number): number | null {
  if (!Number.isFinite(rowCount) || rowCount <= 0) return null;
  return rowCount - 1;
}

/** Pin once per session after load, never while the previous transcript is still showing. */
export function readyTranscriptPinKey(opts: {
  sessionId: string | null | undefined;
  loading?: boolean;
  lastItemId: string | null | undefined;
}): string | null {
  if (!opts.sessionId || opts.loading || !opts.lastItemId) return null;
  return opts.sessionId;
}

/** A loading gap must forget the last pin so reopening the same session still lands on the latest reply. */
export function shouldPinReadyTranscript(
  prevKey: string | null,
  nextKey: string | null,
): { pin: boolean; remember: string | null } {
  if (!nextKey) return { pin: false, remember: null };
  if (nextKey === prevKey) return { pin: false, remember: prevKey };
  return { pin: true, remember: nextKey };
}
