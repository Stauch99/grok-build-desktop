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
