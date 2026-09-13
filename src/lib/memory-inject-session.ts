export function markInjected(ids: ReadonlySet<string>, sessionId: string, injected: boolean): Set<string> {
  const next = new Set(ids);
  if (injected) next.add(sessionId);
  return next;
}

export function markStarted(ids: ReadonlySet<string>, sessionId: string): Set<string> {
  const next = new Set(ids);
  next.add(sessionId);
  return next;
}

export function dismissInjected(ids: ReadonlySet<string>, sessionId: string): Set<string> {
  const next = new Set(ids);
  next.delete(sessionId);
  return next;
}

export function chatHasPromptHistory(items: ReadonlyArray<{ kind: string }>): boolean {
  return items.some((item) => item.kind === "user" || item.kind === "assistant");
}
