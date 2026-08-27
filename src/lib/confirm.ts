export type ConfirmState = { id: string; until: number };

export const CONFIRM_WINDOW_MS = 3000;

export function armConfirm(id: string, now: number, windowMs = CONFIRM_WINDOW_MS): ConfirmState {
  return { id, until: now + windowMs };
}

export function isArmed(state: ConfirmState | null, id: string, now: number): boolean {
  return !!state && state.id === id && now < state.until;
}

/** First click arms; a second click inside the window confirms. */
export function tapDanger(
  state: ConfirmState | null,
  id: string,
  now: number,
  windowMs = CONFIRM_WINDOW_MS,
): { confirmed: boolean; next: ConfirmState | null } {
  if (isArmed(state, id, now)) return { confirmed: true, next: null };
  return { confirmed: false, next: armConfirm(id, now, windowMs) };
}

export function dangerCaption(
  state: ConfirmState | null,
  id: string,
  idle: string,
  armed: string,
  now = Date.now(),
): string {
  return isArmed(state, id, now) ? armed : idle;
}
