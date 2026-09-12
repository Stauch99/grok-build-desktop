let pending: Promise<typeof import("mermaid")> | null = null;

export function loadMermaid(): Promise<typeof import("mermaid")> {
  if (!pending) pending = import("mermaid");
  return pending;
}

const MAX_SVG = 40;
const svgCache = new Map<string, string>();

function svgKey(source: string, dark: boolean): string {
  return `${dark ? "d" : "l"}\0${source}`;
}

export function getMermaidSvg(source: string, dark: boolean): string | undefined {
  const key = svgKey(source, dark);
  const hit = svgCache.get(key);
  if (hit !== undefined) {
    svgCache.delete(key);
    svgCache.set(key, hit);
  }
  return hit;
}

export function setMermaidSvg(source: string, dark: boolean, svg: string): void {
  const key = svgKey(source, dark);
  svgCache.delete(key);
  svgCache.set(key, svg);
  if (svgCache.size > MAX_SVG) {
    const oldest = svgCache.keys().next().value;
    if (oldest !== undefined) svgCache.delete(oldest);
  }
}
