export const FILE_TREE_VIRTUALIZE_AFTER = 24;
export const WORKSPACE_ENTRY_CAP = 2000;

export type FileTreeListNode = { name: string; path: string; kind: "file" | "dir" };

export type FileTreeRow =
  | { kind: "heading"; key: string; labelKey: "file.folders" | "file.files" }
  | { kind: "node"; key: string; node: FileTreeListNode };

export function flattenFileTreeRows(dirs: FileTreeListNode[], files: FileTreeListNode[]): FileTreeRow[] {
  const rows: FileTreeRow[] = [];
  if (dirs.length > 0) rows.push({ kind: "heading", key: "folders", labelKey: "file.folders" });
  for (const node of dirs) rows.push({ kind: "node", key: `dir:${node.path}`, node });
  if (files.length > 0) rows.push({ kind: "heading", key: "files", labelKey: "file.files" });
  for (const node of files) rows.push({ kind: "node", key: `file:${node.path}`, node });
  return rows;
}

export function shouldVirtualizeFileTree(rows: readonly FileTreeRow[], after = FILE_TREE_VIRTUALIZE_AFTER): boolean {
  return rows.length > after;
}
