/**
 * Frontend allow-list for Tauri `convertFileSrc`. Workspace roots come from
 * cwd; grok session artifacts live under `~/.grok/sessions`. Callers may pass
 * "" for grokHome when the UI has no grok-home API — session paths are still
 * allowed via a `/.grok/sessions/` segment check. Never treat `$HOME` as a root.
 */

function stripTrailingSlash(path: string): string {
  return path.replace(/\/+$/, "");
}

/** Resolve `.` / `..` with POSIX semantics. Returns null for empty or relative paths. */
function resolvePath(path: string): string | null {
  const raw = path.trim().replace(/\\/g, "/");
  if (!raw) return null;
  const absolute = raw.startsWith("/");
  if (!absolute) return null;
  const stack: string[] = [];
  for (const part of raw.split("/")) {
    if (part === "" || part === ".") continue;
    if (part === "..") {
      if (stack.length === 0) continue;
      stack.pop();
      continue;
    }
    stack.push(part);
  }
  if (stack.includes("..")) return null;
  return "/" + stack.join("/");
}

export function assetRoots(cwd: string, grokHome: string): string[] {
  const roots: string[] = [];
  const workspace = stripTrailingSlash(cwd.trim());
  if (workspace) roots.push(workspace);
  const home = stripTrailingSlash(grokHome.trim());
  if (home) {
    roots.push(home.endsWith("/sessions") ? home : `${home}/sessions`);
  }
  return roots;
}

const SESSIONS_SEGMENT = "/.grok/sessions/";

export function isAssetAllowed(path: string, roots: string[]): boolean {
  const resolved = resolvePath(path);
  if (resolved == null) return false;
  for (const root of roots) {
    const normalizedRoot = resolvePath(root) ?? stripTrailingSlash(root.trim());
    if (!normalizedRoot || normalizedRoot === "/") continue;
    if (resolved === normalizedRoot || resolved.startsWith(normalizedRoot + "/")) return true;
  }
  return resolved.includes(SESSIONS_SEGMENT);
}

export function safeFileSrc(
  path: string,
  roots: string[],
  convert: (p: string) => string,
): string | null {
  if (!isAssetAllowed(path, roots)) return null;
  return convert(path);
}
