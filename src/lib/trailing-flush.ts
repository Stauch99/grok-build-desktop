/** Debounce window for coalescing composer-draft persists. */
export const DRAFT_PERSIST_MS = 400;

export type TrailingFlush<T> = {
  /** Store the latest value and (re)arm the trailing timer. */
  push: (value: T) => void;
  /** Store the value and emit it now, dropping any older pending value. */
  pushNow: (value: T) => void;
  /** Emit the pending value immediately and cancel the timer; no-op when empty. */
  flush: () => void;
};

/** Trailing-edge coalescer: only the newest pushed value is emitted, at most once per `ms` of quiet. */
export function createTrailingFlush<T>(emit: (value: T) => void, ms: number): TrailingFlush<T> {
  let pending: T | null = null;
  let timer: ReturnType<typeof setTimeout> | null = null;
  const flush = () => {
    if (timer != null) {
      clearTimeout(timer);
      timer = null;
    }
    if (pending == null) return;
    const value = pending;
    pending = null;
    emit(value);
  };
  const push = (value: T) => {
    pending = value;
    if (timer != null) clearTimeout(timer);
    timer = setTimeout(() => {
      timer = null;
      flush();
    }, ms);
  };
  return { push, pushNow: (value) => (push(value), flush()), flush };
}
