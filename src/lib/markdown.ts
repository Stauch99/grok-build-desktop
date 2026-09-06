import { marked } from "marked";
import { rewriteLocalMediaHtml } from "./media";
import { linkifyLocalPaths, sanitizeHtml } from "./text";

export type AssistantBlock =
  | { kind: "md"; text: string }
  | { kind: "mermaid"; text: string; closed: boolean };

const OPEN = /^```mermaid[ \t]*\r?$/i;
const CLOSE = /^```[ \t]*\r?$/;
const FENCE = /^(\s*)(`{3,}|~{3,})/;
const BLOCK_NEXT = /^(#{1,6}\s|`{3,}|~{3,}|\s*[-*+]\s|\s*\d+[.)]\s|\s*>|\s*\|)/;
const CJK = /[\u3040-\u30ff\u3400-\u9fff\uf900-\ufaff\uff66-\uff9f]/;

function isCjk(ch: string): boolean {
  return CJK.test(ch);
}

function shouldJoinMarkdownLines(prev: string, next: string): boolean {
  if (prev === "" || next === "") return false;
  if (BLOCK_NEXT.test(next)) return false;
  if (/^\s{0,3}#{1,6}\s/.test(prev)) return false;
  if (/^(\s*[-*+] |\s*\d+[.)] )/.test(prev)) return false;
  if (/(  |\\)$/.test(prev)) return false;
  if (/^\s{4,}\S/.test(prev) || /^\s{4,}\S/.test(next)) return false;
  return true;
}

function joinGlue(prev: string, next: string): string {
  if (/\s$/.test(prev) || /^\s/.test(next)) return "";
  const a = prev[prev.length - 1] ?? "";
  const b = next[0] ?? "";
  if (isCjk(a) && isCjk(b)) return "";
  if (isCjk(a) && /[\p{P}\p{S}]/u.test(b)) return "";
  if (/[\p{P}\p{S}]/u.test(a) && isCjk(b)) return "";
  return " ";
}

/** LLM replies wrap CJK prose at a column; those newlines are not paragraphs. */
export function unwrapMarkdownSoftBreaks(src: string): string {
  const lines = src.split("\n");
  const out: string[] = [];
  let fenceMark: string | null = null;
  for (const line of lines) {
    const fence = line.match(FENCE);
    if (fenceMark) {
      out.push(line);
      if (fence && line.trim().startsWith(fenceMark)) fenceMark = null;
      continue;
    }
    if (fence) {
      fenceMark = fence[2];
      out.push(line);
      continue;
    }
    const prev = out.length ? out[out.length - 1] : null;
    if (prev != null && shouldJoinMarkdownLines(prev, line)) {
      out[out.length - 1] = prev + joinGlue(prev, line) + line;
      continue;
    }
    out.push(line);
  }
  return out.join("\n");
}

export type MarkdownToSrc = (path: string) => string;

export function renderMd(text: string, cwd = "", toSrc?: MarkdownToSrc): string {
  const html = linkifyLocalPaths(
    sanitizeHtml(marked.parse(unwrapMarkdownSoftBreaks(text), { async: false, gfm: true, breaks: false }) as string),
  );
  return toSrc ? rewriteLocalMediaHtml(html, cwd, toSrc) : html;
}

export function splitAssistantBlocks(src: string): AssistantBlock[] {
  const lines = src.split("\n");
  const out: AssistantBlock[] = [];
  let buf: string[] = [];
  const flushMd = () => {
    if (buf.length === 0) return;
    const text = buf.join("\n");
    buf = [];
    if (text.length) out.push({ kind: "md", text });
  };
  for (let i = 0; i < lines.length; i++) {
    if (!OPEN.test(lines[i])) {
      buf.push(lines[i]);
      continue;
    }
    flushMd();
    const body: string[] = [];
    let closed = false;
    i += 1;
    for (; i < lines.length; i++) {
      if (CLOSE.test(lines[i])) {
        closed = true;
        break;
      }
      body.push(lines[i]);
    }
    out.push({ kind: "mermaid", text: body.join("\n"), closed });
    if (!closed) break;
  }
  flushMd();
  return out.length ? out : [{ kind: "md", text: src }];
}

