import { renderMd, type MarkdownToSrc } from "./markdown";

const MAX = 80;
const cache = new Map<string, string>();

export function memoizeMarkdown(text: string, cwd: string, toSrc: MarkdownToSrc): string {
  const key = `${cwd}\0${text}`;
  const hit = cache.get(key);
  if (hit !== undefined) {
    cache.delete(key);
    cache.set(key, hit);
    return hit;
  }
  const html = renderMd(text, cwd, toSrc);
  cache.set(key, html);
  if (cache.size > MAX) {
    const oldest = cache.keys().next().value;
    if (oldest !== undefined) cache.delete(oldest);
  }
  return html;
}
