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
  "svg",
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

export type PreviewKind = "markdown" | "code" | "html" | "unsupported";

export function previewKind(path: string): PreviewKind {
  if (!isTextPreviewable(path)) return "unsupported";
  const ext = fileExt(path);
  if (ext === "html" || ext === "htm") return "html";
  return isMarkdown(path) ? "markdown" : "code";
}

/** Shorten an absolute path for the preview header. */
export function relativeTo(path: string, root: string): string {
  if (!root) return path;
  const base = root.replace(/\/$/, "");
  if (path === base) return path.split("/").pop() || path;
  if (path.startsWith(`${base}/`)) return path.slice(base.length + 1);
  return path;
}
