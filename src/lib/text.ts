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
  if (d < 60_000) return "刚刚";
  const m = Math.round(d / 60000);
  if (m < 60) return `${m} 分钟前`;
  const h = Math.round(m / 60);
  if (h < 24) return `${h} 小时前`;
  return `${Math.round(h / 24)} 天前`;
}

export function sanitizeHtml(html: string): string {
  return html
    .replace(/<script\b[\s\S]*?<\/script>/gi, "")
    .replace(/<iframe\b[\s\S]*?<\/iframe>/gi, "")
    .replace(/<object\b[\s\S]*?<\/object>/gi, "")
    .replace(/\son\w+\s*=\s*("[^"]*"|'[^']*'|[^\s>]+)/gi, "")
    .replace(/javascript:/gi, "")
    .replace(/data:text\/html/gi, "");
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

export function surfaceStderr(line: string): string | null {
  const t = cleanLogLine(line);
  if (!t) return null;
  if (/worker quit|Transport channel closed|request::Error|os error 61|Connection reset/i.test(t)) {
    return null;
  }
  if (!/error|fail|fatal|panic/i.test(t) && !shouldClearBusyOnAgentStderr(line)) return null;
  return t.replace(/^\d{4}-\d{2}-\d{2}[T ][\d:.Z+-]+\s*/i, "").slice(0, 140);
}

export function shouldClearBusyOnAgentStderr(line: string): boolean {
  const t = cleanLogLine(line);
  if (!t) return false;
  return /\[SYSTEM_ERROR\]|Authentication required|Prompt for session .+\sfailed/i.test(t);
}

export function resolveOpenTarget(href: string, cwd = ""): string | null {
  const h = href.trim();
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

const ABSOLUTE_PATH = /(^|[\s(])(\/(?:Users|home|tmp|var|opt)\/[^\s<)'"]+|~\/[^\s<)'"]+)/g;

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
        (_m, lead: string, path: string) =>
          `${lead}<a class="file-link" href="${path}">${path}</a>`,
      )
      .replace(RELATIVE_PATH, (m, lead: string, path: string) => {
        // Skip anything the absolute pass already wrapped.
        if (m.includes("<a ")) return m;
        return `${lead}<a class="file-link" href="${path}">${path}</a>`;
      });
    return pre + linked;
  });
}
