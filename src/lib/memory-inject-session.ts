export function markInjected(ids: ReadonlySet<string>, sessionId: string, injected: boolean): Set<string> {
  const next = new Set(ids);
  if (injected) next.add(sessionId);
  return next;
}

export function dismissInjected(ids: ReadonlySet<string>, sessionId: string): Set<string> {
  const next = new Set(ids);
  next.delete(sessionId);
  return next;
}
