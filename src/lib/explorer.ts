export function explorerDirOpen(dirs: readonly string[], path: string): boolean {
  return dirs.includes(path);
}

export function toggleExplorerDir(dirs: readonly string[], path: string): string[] {
  return explorerDirOpen(dirs, path) ? dirs.filter((dir) => dir !== path) : [...dirs, path];
}
