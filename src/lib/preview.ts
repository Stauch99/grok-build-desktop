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
  "scss",
  "less",
  "sass",
  "html",
  "htm",
  "rs",
  "py",
  "go",
  "java",
  "kt",
  "kts",
  "c",
  "h",
  "cc",
  "cpp",
  "cxx",
  "hpp",
  "hh",
  "m",
  "mm",
  "swift",
  "rb",
  "php",
  "vue",
  "svelte",
  "sql",
  "dart",
  "lua",
  "zig",
  "scala",
  "cs",
  "r",
  "proto",
  "graphql",
  "gql",
  "ini",
  "conf",
  "cfg",
  "properties",
  "sh",
  "zsh",
  "bash",
  "yml",
  "yaml",
  "xml",
  "csv",
  "log",
  "env",
  "lock",
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

export const MAX_PREVIEW_TABS = 8;
export type PreviewTab = { path: string };
export type PreviewCacheEntry = { text: string; mtime: number };

export function upsertPreviewTab(tabs: PreviewTab[], path: string): PreviewTab[] {
  if (tabs.some((tab) => tab.path === path)) return tabs;
  const next = [...tabs, { path }];
  return next.length > MAX_PREVIEW_TABS ? next.slice(next.length - MAX_PREVIEW_TABS) : next;
}

export function putPreviewDraft(drafts: Map<string, string>, path: string, draft: string): void {
  drafts.set(path, draft);
}

/** Restore an in-progress edit for `path`, or fall back to the loaded file text. */
export function draftForPath(drafts: Map<string, string>, path: string, fileText: string): string {
  const stored = drafts.get(path);
  return stored !== undefined ? stored : fileText;
}

export function dropPreviewDraft(drafts: Map<string, string>, path: string): void {
  drafts.delete(path);
}

export function removePreviewTab(tabs: PreviewTab[], path: string, drafts?: Map<string, string>): PreviewTab[] {
  if (drafts) dropPreviewDraft(drafts, path);
  return tabs.filter((tab) => tab.path !== path);
}

export function activeTabAfterClose(tabs: PreviewTab[], closed: string, active: string | null): string | null {
  if (active !== closed) return active;
  const at = tabs.findIndex((tab) => tab.path === closed);
  const next = tabs[at + 1] ?? tabs[at - 1];
  return next?.path ?? null;
}

export function putPreviewCache(
  cache: Map<string, PreviewCacheEntry>,
  path: string,
  text: string,
  mtime = Date.now(),
): void {
  cache.set(path, { text, mtime });
}

export const IMAGE_ZOOM_MIN = 0.25;
export const IMAGE_ZOOM_MAX = 8;

export function clampImageZoom(zoom: number): number {
  return Math.min(IMAGE_ZOOM_MAX, Math.max(IMAGE_ZOOM_MIN, zoom));
}

export function zoomByWheel(zoom: number, deltaY: number): number {
  const factor = deltaY > 0 ? 1 / 1.1 : 1.1;
  return clampImageZoom(zoom * factor);
}

export function panImage(pan: { x: number; y: number }, dx: number, dy: number): { x: number; y: number } {
  return { x: pan.x + dx, y: pan.y + dy };
}

export function imageTransform(state: { zoom: number; x: number; y: number }): string {
  return `translate(${state.x}px, ${state.y}px) scale(${state.zoom})`;
}

export function lineGutter(text: string): number[] {
  return text.split("\n").map((_, i) => i + 1);
}

export function previewSaveToast(ok: boolean, err?: unknown): string {
  if (ok) return "已保存";
  const raw = err instanceof Error ? err.message : err != null ? String(err) : "";
  return raw.trim() || "保存失败";
}

export function afterPreviewSave(ok: boolean, refresh?: () => void): void {
  if (ok) refresh?.();
}

export type ImageView = { zoom: number; x: number; y: number };
