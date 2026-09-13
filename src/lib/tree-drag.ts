/**
 * Drag payload shared between the file tree (source) and the composer drop
 * zone (target). Carries an absolute workspace path under a custom MIME type
 * so a tree drag attaches the file instead of dropping its name as text.
 */

export const GROK_FILE_PATH_MIME = "application/x-grok-file-path";

/** Stamp a drag payload with the absolute path, plus a text/plain fallback. */
export function setGrokFileDrag(dt: DataTransfer | null, path: string): void {
  if (!dt) return;
  try {
    dt.setData(GROK_FILE_PATH_MIME, path);
    dt.setData("text/plain", path);
    dt.effectAllowed = "copy";
  } catch {
    /* synthetic DataTransfer without setData — nothing to stamp */
  }
}

/** True while a file-tree drag is in flight (types list only exposes keys). */
export function hasGrokFileDrag(dt: DataTransfer | null): boolean {
  if (!dt) return false;
  try {
    return [...dt.types].includes(GROK_FILE_PATH_MIME);
  } catch {
    return false;
  }
}

/** Absolute path carried by a file-tree drag, or "" for any other payload. */
export function grokFileDragPath(dt: DataTransfer | null): string {
  if (!dt) return "";
  try {
    return dt.getData(GROK_FILE_PATH_MIME).trim();
  } catch {
    return "";
  }
}
