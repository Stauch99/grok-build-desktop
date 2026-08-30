export type SessionPresence = "idle" | "open" | "focused";

export type WindowPresence = {
  openIds: readonly string[];
  focusedId: string | null;
  osFocused: boolean;
};

export function sessionPresence(
  id: string,
  openIds: Iterable<string>,
  focusedId: string | null,
): SessionPresence {
  const open = openIds instanceof Set ? openIds : new Set(openIds);
  if (!open.has(id)) return "idle";
  if (focusedId && id === focusedId) return "focused";
  return "open";
}

export function presenceClass(presence: SessionPresence): string {
  if (presence === "focused") return "active";
  if (presence === "open") return "open";
  return "";
}

export function unionOpenIds(...groups: Iterable<string>[]): string[] {
  const seen = new Set<string>();
  const out: string[] = [];
  for (const group of groups) {
    for (const id of group) {
      if (!id || seen.has(id)) continue;
      seen.add(id);
      out.push(id);
    }
  }
  return out;
}

export function presenceAcrossWindows(id: string, windows: readonly WindowPresence[]): SessionPresence {
  const open = unionOpenIds(...windows.map((w) => w.openIds));
  const focused = windows.find((w) => w.osFocused)?.focusedId ?? null;
  return sessionPresence(id, open, focused);
}

export function openIdsFromBindings(bindings: Record<string, string | null | undefined>): string[] {
  return unionOpenIds(Object.values(bindings).filter((id): id is string => !!id));
}
