import { isMarkdownFenceOpen } from "./markdown";

/**
 * A markdown block split at fenced code boundaries. Code segments render
 * through React (header row + copy button); md segments keep going through
 * `marked` so prose output is unchanged.
 */
export type MdSegment =
  | { kind: "md"; text: string }
  | { kind: "code"; lang: string; code: string };

/** Up to 3 leading spaces, then a run of ``` or ~~~, then the info string. */
const FENCE = /^ {0,3}(`{3,}|~{3,})(.*)$/;

/** Closing fence: same mark, run at least as long as the opener, empty info. */
function isFenceClose(line: string, mark: string): boolean {
  const m = line.match(FENCE);
  if (!m) return false;
  const run = m[1];
  return run[0] === mark[0] && run.length >= mark.length && m[2].trim() === "";
}

/**
 * Split an assistant markdown block into prose and fenced-code segments.
 * Only top-level fences count (same predicate `unwrapMarkdownSoftBreaks`
 * uses, plus the ≤3-space indent marked requires); fences inside lists or
 * blockquotes stay inline so marked keeps rendering them as before. An
 * unclosed fence runs to the end, matching marked's streaming behaviour.
 */
export function splitCodeSegments(src: string): MdSegment[] {
  const lines = src.split("\n");
  const out: MdSegment[] = [];
  let buf: string[] = [];
  const flush = () => {
    if (buf.length === 0) return;
    const text = buf.join("\n");
    buf = [];
    if (text.length) out.push({ kind: "md", text });
  };
  for (let i = 0; i < lines.length; i++) {
    const line = lines[i];
    const m = line.match(FENCE);
    if (!m || !isMarkdownFenceOpen(line)) {
      buf.push(line);
      continue;
    }
    flush();
    const mark = m[1];
    const lang = m[2].trim().split(/\s+/)[0] ?? "";
    const body: string[] = [];
    let closed = false;
    i += 1;
    for (; i < lines.length; i++) {
      if (isFenceClose(lines[i], mark)) {
        closed = true;
        break;
      }
      body.push(lines[i]);
    }
    out.push({ kind: "code", lang, code: body.join("\n") });
    if (!closed) break;
  }
  flush();
  return out.length ? out : [{ kind: "md", text: src }];
}
