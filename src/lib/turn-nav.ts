/**
 * Alt+↑/↓ jumps between user turns. `currentId` is the turn considered
 * on-screen (the TOC's active tick); when nothing is active yet, Down lands on
 * the first turn and Up on the last. Indices clamp at both ends — no wrap, so
 * holding Alt+↓ parks on the newest turn instead of bouncing to the top.
 */
export function nextTurnIndex(
  ids: string[],
  currentId: string | null | undefined,
  dir: 1 | -1,
): number {
  if (ids.length === 0) return -1;
  const cur = currentId == null ? -1 : ids.indexOf(currentId);
  if (cur < 0) return dir === 1 ? 0 : ids.length - 1;
  return Math.min(ids.length - 1, Math.max(0, cur + dir));
}
