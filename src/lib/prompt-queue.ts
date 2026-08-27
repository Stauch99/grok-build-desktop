export type QueuedPrompt = { id: number; text: string };

export type QueueState = { items: QueuedPrompt[]; nextId: number };

export const emptyQueue = (): QueueState => ({ items: [], nextId: 1 });

const MAX_QUEUED = 10;

/** Blank text is dropped; the queue is capped so a stuck turn cannot grow it forever. */
export function enqueue(state: QueueState, text: string): QueueState {
  const t = text.trim();
  if (!t) return state;
  if (state.items.length >= MAX_QUEUED) return state;
  return {
    items: [...state.items, { id: state.nextId, text: t }],
    nextId: state.nextId + 1,
  };
}

export function dequeue(state: QueueState): { next: QueuedPrompt | null; rest: QueueState } {
  const [next, ...items] = state.items;
  if (!next) return { next: null, rest: state };
  return { next, rest: { ...state, items } };
}

export function removeQueued(state: QueueState, id: number): QueueState {
  return { ...state, items: state.items.filter((q) => q.id !== id) };
}

/** Move one queued prompt. Out-of-range indexes are a no-op. */
export function reorderQueue(state: QueueState, from: number, to: number): QueueState {
  const { items } = state;
  if (
    from === to ||
    from < 0 ||
    to < 0 ||
    from >= items.length ||
    to >= items.length
  ) {
    return state;
  }
  const next = [...items];
  const [moved] = next.splice(from, 1);
  next.splice(to, 0, moved);
  return { ...state, items: next };
}

export function queueLabel(state: QueueState): string {
  return state.items.length === 0 ? "" : `已排队 ${state.items.length} 条`;
}

/** Replace queued text. Blank replacement removes the item. */
export function editQueued(state: QueueState, id: number, text: string): QueueState {
  const idx = state.items.findIndex((q) => q.id === id);
  if (idx < 0) return state;
  const next = text.trim();
  if (!next) return removeQueued(state, id);
  const items = state.items.map((q) => (q.id === id ? { ...q, text: next } : q));
  return { ...state, items };
}
