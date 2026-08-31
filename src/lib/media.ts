import { resolveOpenTarget } from "./text";

const IMAGE_EXT = new Set([
  "png",
  "jpg",
  "jpeg",
  "gif",
  "webp",
  "svg",
  "bmp",
  "ico",
  "tif",
  "tiff",
  "heic",
  "avif",
]);

const VIDEO_EXT = new Set(["mp4", "webm", "mov", "m4v", "ogv"]);

export type MediaKind = "image" | "video";

function extOf(path: string): string {
  const base = path.replace(/\/+$/, "").split("/").pop() || path;
  const dot = base.lastIndexOf(".");
  return dot > 0 ? base.slice(dot + 1).toLowerCase() : "";
}

export function mediaKind(path: string): MediaKind | null {
  const ext = extOf(path);
  if (IMAGE_EXT.has(ext)) return "image";
  if (VIDEO_EXT.has(ext)) return "video";
  return null;
}

function escapeAttr(value: string): string {
  return value.replace(/&/g, "&amp;").replace(/"/g, "&quot;").replace(/</g, "&lt;");
}

function localMediaPath(href: string, cwd: string): string | null {
  const path = resolveOpenTarget(href, cwd);
  if (!path || /^https?:\/\//i.test(path)) return null;
  return mediaKind(path) ? path : null;
}

function mediaTag(kind: MediaKind, src: string, name: string): string {
  const safeSrc = escapeAttr(src);
  const safeName = escapeAttr(name);
  if (kind === "video") {
    return `<span class="md-media"><video src="${safeSrc}" controls preload="metadata" playsinline></video></span>`;
  }
  return `<span class="md-media"><img src="${safeSrc}" alt="${safeName}"></span>`;
}

function basename(path: string): string {
  return path.replace(/\/+$/, "").split("/").pop() || path;
}

/**
 * Tauri cannot load `file://` (or a raw POSIX path) in the webview. Rewrite
 * local image/video tags to `convertFileSrc`, and turn cited media file-links
 * into an inline preview so the path does not have to be hunted in Finder.
 */
export function rewriteLocalMediaHtml(
  html: string,
  cwd: string,
  toSrc: (absPath: string) => string,
): string {
  const seen = new Set<string>();
  const rewritten = html
    .replace(/<img\b([^>]*?)\bsrc=(["'])([^"']*)\2([^>]*)>/gi, (full, pre: string, _q: string, src: string, post: string) => {
      const path = resolveOpenTarget(src, cwd);
      if (!path || /^https?:\/\//i.test(path)) return full;
      seen.add(path);
      return `<img${pre}src="${escapeAttr(toSrc(path))}"${post}>`;
    })
    .replace(/<video\b([^>]*?)\bsrc=(["'])([^"']*)\2([^>]*)>/gi, (full, pre: string, _q: string, src: string, post: string) => {
      const path = resolveOpenTarget(src, cwd);
      if (!path || /^https?:\/\//i.test(path)) return full;
      seen.add(path);
      return `<video${pre}src="${escapeAttr(toSrc(path))}"${post}>`;
    })
    .replace(/<a\b([^>]*?)href=(["'])([^"']*)\2([^>]*)>([\s\S]*?)<\/a>/gi, (full, _pre: string, _q: string, href: string) => {
      const path = localMediaPath(href, cwd);
      if (!path || seen.has(path)) return full;
      const kind = mediaKind(path);
      if (!kind) return full;
      seen.add(path);
      if (kind === "video") return `${full}${mediaTag(kind, toSrc(path), basename(path))}`;
      return full.replace(/<\/a>$/i, `${mediaTag(kind, toSrc(path), basename(path))}</a>`);
    });
  return rewritten;
}
