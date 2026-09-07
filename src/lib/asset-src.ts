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

/**
 * Origin of a Tauri asset URL. `convertFileSrc` percent-encodes the whole
 * path into one segment, so we only take scheme/host from it.
 */
export function assetOrigin(convertSample: string): string {
  if (/^https?:\/\/asset\.localhost/i.test(convertSample)) {
    return new URL(convertSample).origin;
  }
  return "asset://localhost";
}

/**
 * Asset URL that keeps directory slashes. Relative css/js on a previewed
 * HTML page then resolve next to the file instead of `asset://localhost/_assets/...`.
 */
export function assetPageSrc(path: string, convert: (p: string) => string): string | null {
  const resolved = resolvePath(path);
  if (resolved == null) return null;
  const origin = assetOrigin(convert(resolved));
  const segs = resolved.split("/").filter((part) => part !== "").map(encodeURIComponent);
  return `${origin}/%2F${segs.join("/")}`;
}

export function safeHtmlSrc(
  path: string,
  roots: string[],
  convert: (p: string) => string,
): string | null {
  if (!isAssetAllowed(path, roots)) return null;
  return assetPageSrc(path, convert);
}
