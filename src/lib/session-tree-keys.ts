/** Arrow / Home / End index for a flat list of session buttons. */
export function sessionTreeNavIndex(
  key: string,
  opts: { index: number; count: number },
): number | null {
  if (opts.count <= 0) return null;
  const i = Math.min(Math.max(opts.index, 0), opts.count - 1);
  if (key === "ArrowDown") return Math.min(opts.count - 1, i + 1);
  if (key === "ArrowUp") return Math.max(0, i - 1);
  if (key === "Home") return 0;
  if (key === "End") return opts.count - 1;
  return null;
}

export type SessionTreeNav =
  | { type: "move"; index: number }
  | { type: "toggle-expand" };

/** ArrowLeft/Right expand or collapse parents; otherwise move like Up/Down. */
export function sessionTreeNav(
  key: string,
  opts: { index: number; count: number; hasKids: boolean; expanded: boolean },
): SessionTreeNav | null {
  if (key === "ArrowRight" && opts.hasKids && !opts.expanded) return { type: "toggle-expand" };
  if (key === "ArrowLeft" && opts.hasKids && opts.expanded) return { type: "toggle-expand" };
  const mapped = key === "ArrowRight" ? "ArrowDown" : key === "ArrowLeft" ? "ArrowUp" : key;
  const index = sessionTreeNavIndex(mapped, opts);
  if (index == null) return null;
  return { type: "move", index };
}
