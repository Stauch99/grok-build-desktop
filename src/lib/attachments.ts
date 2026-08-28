import { basename } from "./text";

export type Attachment = { path: string; name: string; kind: "file" | "dir"; bytes?: number };

export const ATTACHMENT_CAP = 20;
export const ATTACHMENT_BYTE_CAP = 20 * 1024 * 1024;

export type AttachmentVisualKind = "pdf" | "md" | "image" | "folder" | "other";

const IMAGE_EXT = new Set(["png", "jpg", "jpeg", "gif", "webp", "svg", "heic", "bmp", "ico", "tif", "tiff"]);

/** Normalize stored path: dirs keep a trailing slash, files do not. */
export function normalizeAttachmentPath(path: string, kind: "file" | "dir"): string {
  const trimmed = path.trim();
  if (!trimmed) return trimmed;
  if (kind === "dir") return trimmed.replace(/\/?$/, "/");
  return trimmed.replace(/\/+$/, "");
}

export function attachmentFromPath(
  path: string,
  kind?: "file" | "dir",
  bytes?: number,
): Attachment {
  const inferred: "file" | "dir" =
    kind ?? (path.endsWith("/") || path.endsWith("\\") ? "dir" : "file");
  const normalized = normalizeAttachmentPath(path, inferred);
  const attachment: Attachment = {
    path: normalized,
    name: basename(normalized.replace(/\/$/, "")) || normalized,
    kind: inferred,
  };
  if (inferred === "file" && bytes != null && bytes >= 0) {
    attachment.bytes = bytes;
  }
  return attachment;
}

export function formatBytes(n: number): string {
  if (!Number.isFinite(n) || n < 0) return "";
  if (n < 1024) return `${Math.round(n)} B`;
  if (n < 1024 * 1024) return `${trimDecimal(n / 1024)} KB`;
  if (n < 1024 * 1024 * 1024) return `${trimDecimal(n / (1024 * 1024))} MB`;
  return `${trimDecimal(n / (1024 * 1024 * 1024))} GB`;
}

function trimDecimal(value: number): string {
  const fixed = value.toFixed(1);
  return fixed.endsWith(".0") ? fixed.slice(0, -2) : fixed;
}

function fileExt(name: string): string {
  const dot = name.lastIndexOf(".");
  if (dot <= 0 || dot === name.length - 1) return "";
  return name.slice(dot + 1).toLowerCase();
}

export function attachmentVisualKind(name: string, kind: Attachment["kind"]): AttachmentVisualKind {
  if (kind === "dir") return "folder";
  const ext = fileExt(name);
  if (ext === "pdf") return "pdf";
  if (ext === "md" || ext === "markdown") return "md";
  if (IMAGE_EXT.has(ext)) return "image";
  return "other";
}

/** Short label shown inside the square type icon. */
export function attachmentIconLabel(name: string, kind: Attachment["kind"]): string {
  const visual = attachmentVisualKind(name, kind);
  if (visual === "folder") return "▸";
  if (visual === "pdf") return "PDF";
  if (visual === "md") return "MD";
  if (visual === "image") return "IMG";
  const ext = fileExt(name);
  return ext ? ext.slice(0, 4).toUpperCase() : "···";
}

/** Muted subtitle under the filename. */
export function attachmentMeta(item: Attachment): string {
  if (item.kind === "dir") return "文件夹";
  const ext = fileExt(item.name).toUpperCase() || "FILE";
  if (item.bytes != null) return `${ext} ${formatBytes(item.bytes)}`;
  return ext;
}

export function addAttachments(
  list: Attachment[],
  incoming: Attachment[],
  cap = ATTACHMENT_CAP,
): { next: Attachment[]; dropped: number } {
  const seen = new Set(list.map((a) => a.path));
  const next = [...list];
  let dropped = 0;

  for (const item of incoming) {
    if (seen.has(item.path)) continue;
    if (next.length >= cap) {
      dropped += 1;
      continue;
    }
    seen.add(item.path);
    next.push(item);
  }

  return { next, dropped };
}

/** Expand chips into `@path` tokens ahead of typed text. */
export function formatAttachmentsPrompt(list: Attachment[], text: string): string {
  const tokens = list.map((a) => `@${a.path}`).join(" ");
  const body = text.trim();
  if (!tokens) return body;
  if (!body) return tokens;
  return `${tokens} ${body}`;
}

/** True when the drag carries local files, not plain text/html alone. */
export function isFileDrag(dataTransfer: DataTransfer | null): boolean {
  if (!dataTransfer) return false;
  const types = [...dataTransfer.types];
  if (types.includes("Files")) return true;
  return [...dataTransfer.items].some((item) => item.kind === "file");
}

type PathEntry = { path: string; kind: "file" | "dir"; bytes?: number };

function pathFromFile(file: File): string | null {
  const p = (file as File & { path?: string }).path;
  return p?.trim() || null;
}

async function entryPath(entry: FileSystemEntry, file: File | null): Promise<PathEntry | null> {
  const fromFile = file ? pathFromFile(file) : null;
  if (entry.isDirectory) {
    const path = fromFile ?? entry.fullPath;
    if (!path) return null;
    return { path, kind: "dir" };
  }
  if (entry.isFile) {
    const path = fromFile ?? entry.fullPath;
    if (!path) return null;
    return { path, kind: "file", bytes: file?.size };
  }
  return null;
}

/** Extract absolute paths from an HTML5 drop, when the webview exposes them. */
export async function pathsFromDataTransfer(dataTransfer: DataTransfer): Promise<PathEntry[]> {
  if (!isFileDrag(dataTransfer)) return [];

  const out: PathEntry[] = [];
  const items = [...dataTransfer.items].filter((item) => item.kind === "file");

  for (const item of items) {
    const entry = item.webkitGetAsEntry?.() ?? null;
    const file = item.getAsFile();
    if (entry) {
      const hit = await entryPath(entry, file);
      if (hit?.path.startsWith("/")) out.push(hit);
      continue;
    }
    const path = file ? pathFromFile(file) : null;
    if (path?.startsWith("/")) out.push({ path, kind: "file", bytes: file?.size });
  }

  if (out.length === 0) {
    for (const file of dataTransfer.files) {
      const path = pathFromFile(file);
      if (path?.startsWith("/")) out.push({ path, kind: "file", bytes: file.size });
    }
  }

  return out;
}

export function pathsFromTauriDrop(paths: string[]): Attachment[] {
  return paths
    .map((raw) => {
      const trimmed = raw.trim();
      if (!trimmed.startsWith("/")) return null;
      const kind: "file" | "dir" = trimmed.endsWith("/") ? "dir" : "file";
      return attachmentFromPath(trimmed, kind);
    })
    .filter((a): a is Attachment => a !== null);
}

/** Human reason to toast, or null when the file is fine. */
export function rejectAttachment(file: { name: string; bytes?: number }): string | null {
  if (!file.name.trim()) return "无法添加没有名字的附件";
  if (file.bytes != null && file.bytes > ATTACHMENT_BYTE_CAP) {
    return `文件太大：${file.name}（上限 20 MB）`;
  }
  return null;
}

export type AttachPathEntry = { path: string; kind: "file" | "dir"; bytes?: number };
export type StatAttachmentInfo = { path: string; bytes: number; kind: "file" | "dir" };

function attachFailReason(name: string, err: unknown): string {
  const named = rejectAttachment({ name });
  if (named) return named;
  if (err instanceof Error && err.message.trim()) return err.message;
  const text = String(err ?? "").trim();
  return text || `无法添加这个附件：${name}`;
}

/** Stat files (not dirs). Drop when stat fails or size is over the cap. */
export async function resolveAttachPath(
  entry: AttachPathEntry,
  statFile: (path: string) => Promise<StatAttachmentInfo>,
): Promise<{ attachment: Attachment } | { reason: string }> {
  const name = basename(entry.path) || entry.path;
  const early = rejectAttachment({ name, bytes: entry.bytes });
  if (early) return { reason: early };
  if (entry.kind === "dir") {
    return { attachment: attachmentFromPath(entry.path, "dir") };
  }
  try {
    const info = await statFile(entry.path);
    if (info.kind === "dir") {
      return { attachment: attachmentFromPath(entry.path, "dir") };
    }
    const reason = rejectAttachment({ name, bytes: info.bytes });
    if (reason) return { reason };
    return { attachment: attachmentFromPath(entry.path, "file", info.bytes) };
  } catch (err) {
    return { reason: attachFailReason(name, err) };
  }
}

