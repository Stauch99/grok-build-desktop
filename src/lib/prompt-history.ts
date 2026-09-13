export const PROMPT_HISTORY_MAX = 50;

/**
 * In-session sent-prompt history for ArrowUp recall. Newest last; a duplicate
 * of the newest entry is ignored so rapid resends don't pile up.
 */
export function recordPromptHistory(list: string[], text: string): string[] {
  const t = text.trim();
  if (!t) return list;
  if (list[list.length - 1] === t) return list;
  const next = [...list, t];
  if (next.length > PROMPT_HISTORY_MAX) next.splice(0, next.length - PROMPT_HISTORY_MAX);
  return next;
}

export type HistoryStep = { pos: number; text: string | null };

/** `pos < 0` means the live composer. */
export function historyBack(list: string[], pos: number): HistoryStep {
  if (!list.length) return { pos, text: null };
  const next = pos < 0 ? list.length - 1 : Math.max(0, pos - 1);
  return { pos: next, text: list[next] ?? null };
}

export function historyForward(list: string[], pos: number): HistoryStep {
  if (pos < 0 || !list.length) return { pos: -1, text: null };
  const next = pos + 1;
  if (next >= list.length) return { pos: -1, text: null };
  return { pos: next, text: list[next] };
}
