export const IME_ENTER_GRACE_MS = 50;

export type ImeEnterState = {
  composing: boolean;
  endedAt: number;
};

export type EnterKeyLike = {
  key: string;
  isComposing?: boolean;
  keyCode?: number;
  which?: number;
};

export function emptyImeEnterState(): ImeEnterState {
  return { composing: false, endedAt: 0 };
}

export function applyImeComposition(
  _state: ImeEnterState,
  phase: "start" | "end",
  now: number,
): ImeEnterState {
  if (phase === "start") return { composing: true, endedAt: 0 };
  return { composing: false, endedAt: now };
}

/** True when Enter is confirming an IME candidate, not sending the prompt. */
export function imeBlocksEnter(e: EnterKeyLike, ime: ImeEnterState, now = 0): boolean {
  if (e.isComposing) return true;
  if (e.key === "Process") return true;
  if (e.keyCode === 229 || e.which === 229) return true;
  if (ime.composing) return true;
  if (ime.endedAt > 0 && now - ime.endedAt < IME_ENTER_GRACE_MS) return true;
  return false;
}
