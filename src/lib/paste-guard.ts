/**
 * Large-paste guard. A pasted blob of text beyond these thresholds is offered
 * as a .txt attachment instead of being dumped into the textarea.
 */

export const PASTE_GUARD_MAX_LINES = 30;
export const PASTE_GUARD_MAX_CHARS = 4000;

export type PasteGuardInfo = { chars: number; lines: number; large: boolean };

/** Line/char counts for a paste, and whether it trips the guard. */
export function pasteGuard(text: string | null | undefined): PasteGuardInfo {
  const body = text ?? "";
  const chars = body.length;
  const lines = chars === 0 ? 0 : body.split("\n").length;
  return {
    chars,
    lines,
    large: lines > PASTE_GUARD_MAX_LINES || chars > PASTE_GUARD_MAX_CHARS,
  };
}
