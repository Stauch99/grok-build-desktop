import { relativeTo } from "./preview";
import { basename, dirname } from "./text";

export type FileListEntry = {
  name: string;
  crumb: string;
};

/**
 * Flat list row for a path: basename on one line, parent path as a crumb.
 * No nested folder tree.
 */
export function fileListEntry(path: string, cwd?: string): FileListEntry {
  const name = basename(path);
  const shown = cwd ? relativeTo(path, cwd) : path;
  const dir = dirname(shown);
  if (!dir || dir === ".") return { name, crumb: "" };
  return { name, crumb: dir.replace(/^\//, "") };
}
