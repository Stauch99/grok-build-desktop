export function explorerDirOpen(dirs: readonly string[], path: string): boolean {
  return dirs.includes(path);
}

export function toggleExplorerDir(dirs: readonly string[], path: string): string[] {
  return explorerDirOpen(dirs, path) ? dirs.filter((dir) => dir !== path) : [...dirs, path];
}

export type ExplorerEntry = { name: string; path: string; kind: string };

export type ExplorerFlatRow =
  | { kind: "entry"; key: string; entry: ExplorerEntry; depth: number }
  | { kind: "status"; key: string; depth: number; status: "loading" | "empty" };

export function flattenExplorerRows(
  roots: readonly ExplorerEntry[],
  expandedDirs: readonly string[],
  kidsByPath: Readonly<Record<string, ExplorerEntry[] | undefined>>,
): ExplorerFlatRow[] {
  const out: ExplorerFlatRow[] = [];
  const walk = (entries: readonly ExplorerEntry[], depth: number) => {
    for (const entry of entries) {
      out.push({ kind: "entry", key: entry.path, entry, depth });
      if (entry.kind !== "dir" || !explorerDirOpen(expandedDirs, entry.path)) continue;
      const kids = kidsByPath[entry.path];
      if (kids == null) {
        out.push({ kind: "status", key: `${entry.path}:loading`, depth: depth + 1, status: "loading" });
      } else if (kids.length === 0) {
        out.push({ kind: "status", key: `${entry.path}:empty`, depth: depth + 1, status: "empty" });
      } else {
        walk(kids, depth + 1);
      }
    }
  };
  walk(roots, 0);
  return out;
}

