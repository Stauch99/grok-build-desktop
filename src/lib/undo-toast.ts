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

/** Stable key for a multi-row pending payload; order-insensitive. */
export function pendingBatchKey<T extends { id: string }>(rows: T[]): string {
  return rows.map((row) => row.id).sort().join("\u0000");
}

/** Hide every row of a batch pending payload, plus rows orphaned by it. */
export function omitPendingBatch<T extends { id: string; parentSessionId?: string | null }>(
  items: T[],
  pending: PendingCommit<T[]> | null,
): T[] {
  if (!pending) return items;
  const ids = new Set(pending.payload.map((row) => row.id));
  let out = items;
  for (const id of ids) out = omitPending(out, id);
  return out.filter((item) => !item.parentSessionId || !ids.has(item.parentSessionId));
}
