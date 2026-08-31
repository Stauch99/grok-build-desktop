import { basename } from "./text";

export type Attachment = { path: string; name: string; kind: "file" | "dir"; bytes?: number };

export const ATTACHMENT_CAP = 20;
export const ATTACHMENT_BYTE_CAP = 20 * 1024 * 1024;

export type AttachmentVisualKind =
  | "pdf"
  | "word"
  | "excel"
  | "ppt"
  | "zip"
  | "md"
  | "image"
  | "code"
  | "folder"
  | "other";

const IMAGE_EXT = new Set(["png", "jpg", "jpeg", "gif", "webp", "svg", "heic", "bmp", "ico", "tif", "tiff"]);
const WORD_EXT = new Set(["doc", "docx"]);
const EXCEL_EXT = new Set(["xls", "xlsx", "csv"]);
const PPT_EXT = new Set(["ppt", "pptx"]);
const ZIP_EXT = new Set(["zip", "rar", "7z", "tar", "gz", "tgz"]);
const CODE_EXT = new Set([
  "ts",
  "tsx",
  "js",
  "jsx",
  "mjs",
  "cjs",
  "py",
  "rs",
  "go",
  "java",
  "kt",
  "rb",
  "php",
  "c",
  "cc",
  "cpp",
  "h",
  "hpp",
  "cs",
  "swift",
  "css",
  "scss",
  "html",
  "vue",
  "json",
  "toml",
  "yaml",
  "yml",
  "sh",
  "bash",
  "zsh",
  "sql",
]);
const PASTE_EXT = new Set([
  ...IMAGE_EXT,
  ...WORD_EXT,
  ...EXCEL_EXT,
  ...PPT_EXT,
  ...ZIP_EXT,
  "pdf",
  "md",
  "markdown",
  "txt",
  "json",
  "toml",
  "yaml",
  "yml",
]);
const MIME_EXT: Record<string, string> = {
  "image/png": "png",
  "image/jpeg": "jpg",
  "image/jpg": "jpg",
  "image/gif": "gif",
  "image/webp": "webp",
  "image/bmp": "bmp",
  "image/heic": "heic",
  "image/svg+xml": "svg",
  "application/pdf": "pdf",
};

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
  name?: string,
): Attachment {
  const inferred: "file" | "dir" =
    kind ?? (path.endsWith("/") || path.endsWith("\\") ? "dir" : "file");
  const normalized = normalizeAttachmentPath(path, inferred);
  const attachment: Attachment = {
    path: normalized,
    name: name?.trim() || basename(normalized.replace(/\/$/, "")) || normalized,
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

/** Real unix paths have a directory. Webkit drag `fullPath` is just `/filename`. */
export function isFilesystemPath(path: string): boolean {
  const trimmed = path.trim();
  if (!trimmed.startsWith("/")) return false;
  const rest = trimmed.slice(1);
  if (!rest || rest.includes("\0")) return false;
  if (rest.split("/").includes("..")) return false;
  return rest.includes("/");
}

export function attachmentVisualKind(name: string, kind: Attachment["kind"]): AttachmentVisualKind {
  if (kind === "dir") return "folder";
  const ext = fileExt(name);
  if (ext === "pdf") return "pdf";
  if (ext === "md" || ext === "markdown") return "md";
  if (IMAGE_EXT.has(ext)) return "image";
  if (WORD_EXT.has(ext)) return "word";
  if (EXCEL_EXT.has(ext)) return "excel";
  if (PPT_EXT.has(ext)) return "ppt";
  if (ZIP_EXT.has(ext)) return "zip";
  if (CODE_EXT.has(ext)) return "code";
  return "other";
}

export function attachmentChipLayout(visual: AttachmentVisualKind): "thumb" | "file" {
  return visual === "image" ? "thumb" : "file";
}

function sanitizePasteExt(raw: string): string | null {
  const ext = raw.trim().replace(/^\./, "").toLowerCase();
  if (!/^[a-z0-9]{1,8}$/.test(ext)) return null;
  if (!PASTE_EXT.has(ext)) return null;
  if (ext === "jpeg") return "jpg";
  if (ext === "markdown") return "md";
  return ext;
}

/** Safe on-disk extension for a pasted blob. Unknown types become `bin`. */
export function pasteFileExt(name: string, mime: string): string {
  const unsafe = /[\\/]|\.\./.test(name);
  if (!unsafe) {
    const fromName = sanitizePasteExt(fileExt(name));
    if (fromName) return fromName;
  }
  const fromMime = sanitizePasteExt(MIME_EXT[mime.trim().toLowerCase()] ?? "");
  return fromMime ?? "bin";
}

export function pathsFromFileUriList(text: string): string[] {
  const out: string[] = [];
  for (const line of text.split(/\r?\n/)) {
    const trimmed = line.trim();
    if (!trimmed || trimmed.startsWith("#")) continue;
    const path = pathFromFileUrl(trimmed);
    if (path) out.push(path);
  }
  return out;
}

function pathFromFileUrl(raw: string): string | null {
  try {
    const url = new URL(raw);
    if (url.protocol !== "file:") return null;
    const path = decodeURIComponent(url.pathname);
    return path.startsWith("/") ? path : null;
  } catch {
    return null;
  }
}

export type ClipboardAttachHit =
  | { kind: "path"; path: string; fileKind: "file" | "dir"; bytes?: number }
  | { kind: "blob"; file: File };

/** Files/images from a paste. Clipboard screenshots have no filesystem `.path`. */
export function clipboardAttachHits(dataTransfer: DataTransfer | null): ClipboardAttachHit[] {
  if (!dataTransfer) return [];
  const out: ClipboardAttachHit[] = [];
  const seen = new Set<string>();

  const pushPath = (path: string, fileKind: "file" | "dir", bytes?: number) => {
    const trimmed = path.trim();
    if (!isFilesystemPath(trimmed)) return;
    if (seen.has(trimmed)) return;
    seen.add(trimmed);
    out.push({ kind: "path", path: trimmed, fileKind, bytes });
  };

  const pushFile = (file: File | null) => {
    if (!file) return;
    const path = pathFromFile(file);
    if (path && isFilesystemPath(path)) {
      pushPath(path, "file", file.size);
      return;
    }
    if (!file.size && !file.type.startsWith("image/")) return;
    const key = `blob:${file.name}:${file.size}:${file.type}`;
    if (seen.has(key)) return;
    seen.add(key);
    out.push({ kind: "blob", file });
  };

  for (const item of Array.from(dataTransfer.items)) {
    if (item.kind === "file") pushFile(item.getAsFile());
  }
  if (out.length === 0) {
    for (const file of Array.from(dataTransfer.files)) pushFile(file);
  }

  let uriList = "";
  try {
    uriList = dataTransfer.getData("text/uri-list");
  } catch {
    uriList = "";
  }
  for (const path of pathsFromFileUriList(uriList)) {
    pushPath(path, path.endsWith("/") ? "dir" : "file");
  }

  return out;
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
  const path = fromFile && isFilesystemPath(fromFile) ? fromFile : null;
  if (!path) return null;
  if (entry.isDirectory) return { path, kind: "dir" };
  if (entry.isFile) return { path, kind: "file", bytes: file?.size };
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
    if (path && isFilesystemPath(path)) out.push({ path, kind: "file", bytes: file?.size });
  }

  if (out.length === 0) {
    for (const file of dataTransfer.files) {
      const path = pathFromFile(file);
      if (path && isFilesystemPath(path)) out.push({ path, kind: "file", bytes: file.size });
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

export type AttachPathEntry = { path: string; kind: "file" | "dir"; bytes?: number; name?: string };
export type StatAttachmentInfo = { path: string; bytes: number; kind: "file" | "dir" };
export type ImportAttachmentInfo = { path: string; bytes: number; name: string; kind?: "file" | "dir" };

export function invokeErrorMessage(err: unknown): string {
  if (typeof err === "string") return err.trim();
  if (err instanceof Error && err.message.trim()) return err.message.trim();
  if (err && typeof err === "object") {
    const rec = err as Record<string, unknown>;
    for (const key of ["message", "error"]) {
      const value = rec[key];
      if (typeof value === "string" && value.trim()) return value.trim();
    }
  }
  const text = String(err ?? "").trim();
  if (text && text !== "[object Object]") return text;
  return "";
}

function attachFailReason(name: string, err: unknown): string {
  const named = rejectAttachment({ name });
  if (named) return named;
  return invokeErrorMessage(err) || `无法添加这个附件：${name}`;
}

function isOutsideWorkspaceReason(reason: string): boolean {
  return reason.includes("附件不在工作区");
}

/** Stat the path. Copy files into grok home when they live outside the workspace. Directories are always a path reference. */
export async function resolveAttachPath(
  entry: AttachPathEntry,
  statFile: (path: string) => Promise<StatAttachmentInfo>,
  importFile?: (path: string) => Promise<ImportAttachmentInfo>,
): Promise<{ attachment: Attachment } | { reason: string }> {
  const name = entry.name?.trim() || basename(entry.path) || entry.path;
  const early = rejectAttachment({ name, bytes: entry.bytes });
  if (early) return { reason: early };

  const importCopied = async (): Promise<{ attachment: Attachment } | { reason: string }> => {
    if (!importFile) return { reason: "附件不在工作区" };
    try {
      const copied = await importFile(entry.path);
      const copiedReason = rejectAttachment({ name: copied.name, bytes: copied.bytes });
      if (copiedReason) return { reason: copiedReason };
      const kind = copied.kind ?? entry.kind;
      return {
        attachment: attachmentFromPath(copied.path, kind, copied.bytes, copied.name),
      };
    } catch (importErr) {
      return { reason: attachFailReason(name, importErr) };
    }
  };

  try {
    const info = await statFile(entry.path);
    if (info.kind === "dir") {
      return { attachment: attachmentFromPath(entry.path, "dir") };
    }
    const reason = rejectAttachment({ name, bytes: info.bytes });
    if (reason) return { reason };
    return { attachment: attachmentFromPath(entry.path, "file", info.bytes, entry.name) };
  } catch (err) {
    const reason = attachFailReason(name, err);
    if (isOutsideWorkspaceReason(reason)) {
      if (entry.kind === "dir") {
        return { attachment: attachmentFromPath(entry.path, "dir") };
      }
      return importCopied();
    }
    return { reason };
  }
}

