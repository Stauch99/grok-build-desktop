export type PendingCommit<T> = {
  key: string;
  payload: T;
};

export function queuePending<T>(
  current: PendingCommit<T> | null,
  next: PendingCommit<T>,
): { pending: PendingCommit<T>; displaced: T | null } {
  const displaced = current && current.key !== next.key ? current.payload : null;
  return { pending: next, displaced };
}

export function cancelPending<T>(
  current: PendingCommit<T> | null,
  key: string,
): { pending: PendingCommit<T> | null; restored: T | null } {
  if (current?.key === key) return { pending: null, restored: current.payload };
  return { pending: current, restored: null };
}

export function commitPending<T>(
  current: PendingCommit<T> | null,
  key?: string,
): { pending: PendingCommit<T> | null; committed: T | null } {
  if (!current) return { pending: null, committed: null };
  if (key != null && current.key !== key) return { pending: current, committed: null };
  return { pending: null, committed: current.payload };
}

export function omitPending<T extends { id: string }>(items: T[], pendingKey: string | null): T[] {
  if (!pendingKey) return items;
  return items.filter((item) => item.id !== pendingKey);
}
