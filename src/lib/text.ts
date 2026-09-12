import createDOMPurify, { type WindowLike } from "dompurify";
import { tr } from "./i18n-bridge";

/** DOMPurify default URI regexp plus `asset:` for Tauri convertFileSrc URLs. */
const ALLOWED_URI =
  /^(?:(?:(?:f|ht)tps?|mailto|tel|callto|sms|cid|xmpp|asset):|[^a-z]|[a-z+.\-]+(?:[^a-z+.\-:]|$))/i;

const HTML_FORBID_TAGS = ["script", "iframe", "object", "embed", "base", "form", "meta"];

type Purify = ReturnType<typeof createDOMPurify>;
let htmlPurify: Purify | null = null;
let svgPurify: Purify | null = null;

function purifyWindow(): WindowLike {
  if (typeof window !== "undefined" && window.document) return window as unknown as WindowLike;
  throw new Error("sanitizeHtml requires a DOM");
}

function getHtmlPurify(): Purify {
  if (!htmlPurify) htmlPurify = createDOMPurify(purifyWindow());
  return htmlPurify;
}

function getSvgPurify(): Purify {
  if (!svgPurify) svgPurify = createDOMPurify(purifyWindow());
  return svgPurify;
}

export function basename(path: string): string {
  return path.replace(/\/+$/, "").split("/").pop() || path;
}

export function dirname(path: string): string {
  const clean = path.replace(/\/+$/, "");
  const i = clean.lastIndexOf("/");
  return i <= 0 ? "" : clean.slice(0, i);
}

export type ArtifactGroup = {
  folder: string;
  files: { path: string; name: string }[];
};

export function groupArtifactsByFolder(paths: string[]): ArtifactGroup[] {
  const map = new Map<string, { path: string; name: string }[]>();
  for (const path of paths) {
    if (!path) continue;
    const name = basename(path);
    const folder = basename(dirname(path));
    const list = map.get(folder) ?? [];
    list.push({ path, name });
    map.set(folder, list);
  }
  return [...map.entries()].map(([folder, files]) => ({ folder, files }));
}

export function relativeTime(iso: string, now = Date.now()): string {
  if (!iso) return "";
  const t = new Date(iso).getTime();
  if (Number.isNaN(t)) return "";
  const d = now - t;
  if (d < 60_000) return tr("time.justNow");
  const m = Math.round(d / 60000);
  if (m < 60) return tr("time.minutesAgo", { n: m });
  const h = Math.round(m / 60);
  if (h < 24) return tr("time.hoursAgo", { n: h });
  return tr("time.daysAgo", { n: Math.round(h / 24) });
}

export function sanitizeHtml(html: string): string {
  return getHtmlPurify().sanitize(html, {
    USE_PROFILES: { html: true },
    FORBID_TAGS: HTML_FORBID_TAGS,
    FORBID_ATTR: ["srcdoc"],
    ALLOWED_URI_REGEXP: ALLOWED_URI,
  });
}

export function sanitizeSvg(svg: string): string {
  return getSvgPurify().sanitize(svg, {
    USE_PROFILES: { svg: true, svgFilters: true },
    FORBID_TAGS: ["script", "foreignObject", "iframe", "object", "embed", "base", "form", "meta"],
    ALLOWED_URI_REGEXP: ALLOWED_URI,
  });
}

export function escapeText(text: string): string {
  return text
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;");
}

export function textFromContent(content: unknown): string {
  if (!content) return "";
  if (typeof content === "string") return content;
  if (Array.isArray(content)) {
    return content.map(textFromContent).join("");
  }
  if (typeof content === "object" && content !== null) {
    const rec = content as { text?: unknown; thinking?: unknown; think?: unknown };
    if (rec.text != null) return String(rec.text);
    if (rec.thinking != null) return String(rec.thinking);
    if (rec.think != null) return String(rec.think);
  }
  return "";
}

/** Tool verbose / result payload from ACP `rawOutput` (Grok, Codex, Kimi). */
export function textFromRawOutput(raw: unknown): string {
  if (!raw) return "";
  if (typeof raw === "string") return raw;
  const rec = asRecord(raw);
  if (typeof rec.formatted_output === "string") return rec.formatted_output;
  if (typeof rec.output === "string") return rec.output;
  const nested = rec.Content ?? rec.content;
  if (typeof nested === "string") return nested;
  const inner = asRecord(nested);
  if (typeof inner.content === "string") return inner.content;
  if (typeof inner.text === "string") return inner.text;
  const fromContent = textFromContent(raw);
  if (fromContent) return fromContent;
  try {
    return JSON.stringify(raw, null, 2);
  } catch {
    return "";
  }
}

export function asRecord(v: unknown): Record<string, unknown> {
  return v && typeof v === "object" ? (v as Record<string, unknown>) : {};
}

export function cleanLogLine(s: string): string {
  return s
    .replace(/\u001b\[[0-9;]*[A-Za-z]/g, "")
    .replace(/\[[0-9;]*m/g, "")
    .replace(/[\u0000-\u0008\u000b\u000c\u000e-\u001f]/g, "")
    .trim();
}

/** Known-benign stderr chatter that never deserves a toast. */
const STDERR_NOISE =
  /worker quit|Transport channel closed|request::Error|os error 61|Connection reset|DeprecationWarning|ExperimentalWarning|npm warn|npm notice|^npm |^\s*\d+\s*[|>]|\[B  /i;

/** Error markers in English and Chinese; stderr is not always English. */
const STDERR_ERROR =
  /error|fail|fatal|panic|exception|expired|unauthorized|forbidden|refused|denied|invalid|错误|失败|异常|致命|超时|无法|找不到|认证|授权|登录已过期|未登录|连接被拒绝/i;

function stripTs(t: string): string {
  return t.replace(/^\d{4}-\d{2}-\d{2}[T ][\d:.Z+-]+\s*/i, "");
}

/**
 * Picks the toast-worthy line out of a stderr batch (the Rust side merges
 * lines on a 200ms cadence, so `line` may be multi-line). Known noise is
 * dropped; everything else surfaces (error markers first).
 */
export function surfaceStderr(line: string): string | null {
  let fallback: string | null = null;
  for (const raw of line.split("\n")) {
    const t = cleanLogLine(raw);
    if (!t || STDERR_NOISE.test(t)) continue;
    const serious = shouldClearBusyOnAgentStderr(raw);
    const trimmed = stripTs(t).slice(0, 140);
    if (serious) return trimmed;
    if (STDERR_ERROR.test(t)) {
      fallback ??= trimmed;
      continue;
    }
    fallback ??= trimmed;
  }
  return fallback;
}

export function shouldClearBusyOnAgentStderr(line: string): boolean {
  const t = cleanLogLine(line);
  if (!t) return false;
  return /\[SYSTEM_ERROR\]|Authentication required|Prompt for session .+\sfailed|未登录|登录已过期|认证失败|鉴权失败/i.test(
    t,
  );
}

export function resolveOpenTarget(href: string, cwd = ""): string | null {
  let h = href.trim();
  if (h.startsWith("@") && h.length > 1) h = h.slice(1);
  if (!h || /^javascript:/i.test(h) || /^data:/i.test(h)) return null;
  if (/^https?:\/\//i.test(h)) return h;
  if (/^file:\/\//i.test(h)) {
    try {
      const u = new URL(h);
      if (u.hostname && u.hostname !== "localhost" && u.hostname !== "127.0.0.1") return null;
      return decodeURIComponent(u.pathname);
    } catch {
      return h.replace(/^file:\/\//i, "");
    }
  }
  if (h.startsWith("//")) return null;
  if (h.startsWith("/")) return h;
  if (cwd && !h.includes("://")) {
    return `${cwd.replace(/\/$/, "")}/${h.replace(/^\.\//, "")}`;
  }
  return h;
}

/** Extensions worth turning into a clickable, previewable file reference. */
const LINKABLE_EXT =
  "md|markdown|txt|json|jsonl|toml|ts|tsx|js|jsx|mjs|cjs|css|html|htm|rs|py|sh|zsh|bash|yml|yaml|xml|csv|log|svg|lock|sql|go|rb|java|kt|swift|c|h|cpp|hpp|png|jpg|jpeg|gif|webp|bmp|ico|tif|tiff|heic|avif|mp4|webm|mov|m4v|ogv";

const ABSOLUTE_PATH = /(^|[\s(])(@?(?:\/(?:Users|home|tmp|var|opt)\/[^\s<)'"]+|~\/[^\s<)'"]+))/g;

/**
 * Relative workspace paths like `src/lib/chat.ts`. Requires a slash and a known
 * extension so ordinary prose ("and/or", "he/she") is never linkified.
 *
 * The tail guard is a negative lookahead rather than a list of allowed
 * terminators, so CJK punctuation ends a path the same way ASCII does —
 * `见 src/App.tsx。` has to work, this app's output is mostly Chinese.
 * `(?!\.\w)` keeps `src/App.tsx.bak` from being linkified as `src/App.tsx`
 * while still allowing a sentence-final period.
 */
const RELATIVE_PATH = new RegExp(
  String.raw`(^|[\s(\[])((?:\.{1,2}\/)?(?:[\w.@-]+\/)+[\w.@-]+\.(?:${LINKABLE_EXT}))(?![\w@/-])(?!\.\w)`,
  "g",
);

export function linkifyLocalPaths(html: string): string {
  return html.replace(/(^|>)([^<]+)/g, (full, pre: string, text: string) => {
    if (!text.includes("/") && !text.includes("~")) return full;
    const linked = text
      .replace(
        ABSOLUTE_PATH,
        (_m, lead: string, path: string) => {
          const href = path.replace(/^@/, "");
          return `${lead}<a class="file-link" href="${href}">${path}</a>`;
        },
      )
      .replace(RELATIVE_PATH, (m, lead: string, path: string) => {
        // Skip anything the absolute pass already wrapped.
        if (m.includes("<a ")) return m;
        return `${lead}<a class="file-link" href="${path}">${path}</a>`;
      });
    return pre + linked;
  });
}
