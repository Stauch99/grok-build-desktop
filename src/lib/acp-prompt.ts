import { asRecord, resolveOpenTarget } from "./text";
import { mediaKind } from "./media";

export const ACP_IMAGE_BYTE_CAP = 4 * 1024 * 1024;

export type PromptCapabilities = {
  image: boolean;
  embeddedContext: boolean;
};

export type AcpContentBlock =
  | { type: "text"; text: string }
  | { type: "image"; mimeType: string; data: string; uri?: string }
  | { type: "resource"; resource: { uri: string; mimeType: string; blob: string } };

export type PromptImage = {
  path: string;
  mime: string;
  data: string;
  bytes?: number;
};

const IMAGE_MIME: Record<string, string> = {
  png: "image/png",
  jpg: "image/jpeg",
  jpeg: "image/jpeg",
  gif: "image/gif",
  webp: "image/webp",
  svg: "image/svg+xml",
  bmp: "image/bmp",
  ico: "image/x-icon",
  tif: "image/tiff",
  tiff: "image/tiff",
  heic: "image/heic",
  avif: "image/avif",
};

export function promptCapabilitiesFromInitialize(init: unknown): PromptCapabilities {
  const caps = asRecord(asRecord(asRecord(init).agentCapabilities).promptCapabilities);
  return {
    image: caps.image === true,
    embeddedContext: caps.embeddedContext === true,
  };
}

export function imageMimeFromPath(path: string): string {
  const base = path.replace(/\/+$/, "").split("/").pop() || path;
  const dot = base.lastIndexOf(".");
  const ext = dot > 0 ? base.slice(dot + 1).toLowerCase() : "";
  return IMAGE_MIME[ext] ?? "application/octet-stream";
}

export function imageMentionsInText(text: string, cwd = ""): string[] {
  const out: string[] = [];
  const seen = new Set<string>();
  const re = /@(\/[^\s<]+)/g;
  let m: RegExpExecArray | null;
  while ((m = re.exec(text))) {
    const path = resolveOpenTarget(m[0], cwd);
    if (!path || mediaKind(path) !== "image") continue;
    if (seen.has(path)) continue;
    seen.add(path);
    out.push(path);
  }
  return out;
}

export function isSessionPastePath(path: string): boolean {
  return path.replace(/\\/g, "/").includes("/.grok/sessions/pastes/");
}

export function workspacePasteDest(cwd: string, srcPath: string): string {
  const root = cwd.replace(/\/+$/, "");
  const name = srcPath.replace(/\/+$/, "").split("/").pop() || "paste";
  return `${root}/.grok/pastes/${name}`;
}

export function rewriteMentionPaths(text: string, copies: Record<string, string>): string {
  let next = text;
  for (const [from, to] of Object.entries(copies)) {
    if (!from || !to || from === to) continue;
    next = next.split(`@${from}`).join(`@${to}`);
  }
  return next;
}

function fileUri(path: string): string {
  return `file://${path}`;
}

export function buildAcpPromptBlocks(opts: {
  text: string;
  caps: PromptCapabilities;
  images: PromptImage[];
}): AcpContentBlock[] {
  const text = opts.text;
  const media: AcpContentBlock[] = [];
  for (const img of opts.images) {
    const bytes = img.bytes ?? Math.ceil((img.data.length * 3) / 4);
    if (bytes > ACP_IMAGE_BYTE_CAP || !img.data) continue;
    if (opts.caps.image) {
      media.push({ type: "image", mimeType: img.mime, data: img.data, uri: fileUri(img.path) });
    } else if (opts.caps.embeddedContext) {
      media.push({
        type: "resource",
        resource: { uri: fileUri(img.path), mimeType: img.mime, blob: img.data },
      });
    }
  }
  const blocks: AcpContentBlock[] = [];
  if (text.trim()) blocks.push({ type: "text", text });
  blocks.push(...media);
  return blocks.length ? blocks : [{ type: "text", text }];
}

export async function prepareAcpPrompt(opts: {
  text: string;
  cwd: string;
  caps: PromptCapabilities;
  load: (path: string, cwd: string) => Promise<{ mime: string; data: string; bytes: number } | null>;
  copyIntoWorkspace?: (src: string, cwd: string) => Promise<string>;
}): Promise<AcpContentBlock[]> {
  const mentions = imageMentionsInText(opts.text, opts.cwd);
  if (mentions.length === 0) return [{ type: "text", text: opts.text }];
  const copies: Record<string, string> = {};
  const images: PromptImage[] = [];
  for (const src of mentions) {
    let path = src;
    const needsCopy =
      !!opts.cwd &&
      !!opts.copyIntoWorkspace &&
      (isSessionPastePath(src) || !src.startsWith(opts.cwd.replace(/\/+$/, "") + "/"));
    if (needsCopy && opts.copyIntoWorkspace) {
      try {
        const dest = await opts.copyIntoWorkspace(src, opts.cwd);
        if (dest) {
          copies[src] = dest;
          path = dest;
        }
      } catch {
        /* keep the original path; embed may still work */
      }
    }
    try {
      const loaded = await opts.load(path, opts.cwd);
      if (loaded?.data) {
        images.push({
          path,
          mime: loaded.mime || imageMimeFromPath(path),
          data: loaded.data,
          bytes: loaded.bytes,
        });
      }
    } catch {
      /* text mention remains */
    }
  }
  const text = rewriteMentionPaths(opts.text, copies);
  return buildAcpPromptBlocks({ text, caps: opts.caps, images });
}
