const MAX = 40;
const cache = new Map<string, string>();

function key(source: string, dark: boolean): string {
  return `${dark ? "d" : "l"}\0${source}`;
}

export function getMermaidSvg(source: string, dark: boolean): string | undefined {
  const k = key(source, dark);
  const hit = cache.get(k);
  if (hit !== undefined) {
    cache.delete(k);
    cache.set(k, hit);
  }
  return hit;
}

export function setMermaidSvg(source: string, dark: boolean, svg: string): void {
  const k = key(source, dark);
  cache.delete(k);
  cache.set(k, svg);
  if (cache.size > MAX) {
    const oldest = cache.keys().next().value;
    if (oldest !== undefined) cache.delete(oldest);
  }
}
