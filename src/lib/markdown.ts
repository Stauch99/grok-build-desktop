import { marked } from "marked";
import { rewriteLocalMediaHtml } from "./media";
import { linkifyLocalPaths, sanitizeHtml } from "./text";

export type AssistantBlock =
  | { kind: "md"; text: string }
  | { kind: "mermaid"; text: string; closed: boolean };

const OPEN = /^```mermaid[ \t]*\r?$/i;
const CLOSE = /^```[ \t]*\r?$/;

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

export type MarkdownToSrc = (path: string) => string;

export function renderMd(text: string, cwd = "", toSrc?: MarkdownToSrc): string {
  const html = linkifyLocalPaths(
    sanitizeHtml(marked.parse(text, { async: false, gfm: true, breaks: true }) as string),
  );
  return toSrc ? rewriteLocalMediaHtml(html, cwd, toSrc) : html;
}

