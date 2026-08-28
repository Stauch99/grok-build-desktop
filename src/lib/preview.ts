import { mediaKind } from "./media";

const TEXT_EXT = new Set([
  "md",
  "markdown",
  "txt",
  "json",
  "jsonl",
  "toml",
  "ts",
  "tsx",
  "js",
  "jsx",
  "mjs",
  "cjs",
  "css",
  "html",
  "htm",
  "rs",
  "py",
  "sh",
  "zsh",
  "bash",
  "yml",
  "yaml",
  "xml",
  "csv",
  "log",
  "env",
  "gitignore",
  "dockerignore",
]);

export function isTextPreviewable(path: string): boolean {
  const base = path.replace(/\/+$/, "").split("/").pop() || path;
  if (base.startsWith(".") && !base.includes(".", 1)) return true;
  const dot = base.lastIndexOf(".");
  if (dot <= 0) return true;
  return TEXT_EXT.has(base.slice(dot + 1).toLowerCase());
}

export function fileExt(path: string): string {
  const base = path.replace(/\/+$/, "").split("/").pop() || path;
  const dot = base.lastIndexOf(".");
  return dot > 0 ? base.slice(dot + 1).toLowerCase() : "";
}

/** Markdown gets rendered by default; everything else shows its source. */
export function isMarkdown(path: string): boolean {
  const ext = fileExt(path);
  return ext === "md" || ext === "markdown";
}

export type PreviewKind = "markdown" | "code" | "html" | "image" | "video" | "unsupported";

export function previewKind(path: string): PreviewKind {
  const media = mediaKind(path);
  if (media) return media;
  if (!isTextPreviewable(path)) return "unsupported";
  const ext = fileExt(path);
  if (ext === "html" || ext === "htm") return "html";
  return isMarkdown(path) ? "markdown" : "code";
}

/** Desktop invoke errors are English; the chrome is Chinese. */
export function previewErrorCopy(err: unknown): string {
  const raw = String(err ?? "").replace(/^Error:\s*/i, "").trim();
  if (/path not allowed/i.test(raw)) return "无法预览这个文件";
  if (/caller workspace does not match/i.test(raw)) return "工作区不一致，无法预览";
  if (/trusted workspace is not set/i.test(raw)) return "还没有工作区，无法预览";
  return raw || "无法预览这个文件";
}

/** Shorten an absolute path for the preview header. */
export function relativeTo(path: string, root: string): string {
  if (!root) return path;
  const base = root.replace(/\/$/, "");
  if (path === base) return path.split("/").pop() || path;
  if (path.startsWith(`${base}/`)) return path.slice(base.length + 1);
  return path;
}
