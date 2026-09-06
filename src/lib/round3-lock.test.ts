import { existsSync, readdirSync, readFileSync } from "node:fs";
import { dirname, join, relative } from "node:path";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";

const root = join(dirname(fileURLToPath(import.meta.url)), "../..");
const srcRoot = join(root, "src");

const CJK = /[\u4e00-\u9fff]/;
const HTML_TAGS = new Set([
  "a",
  "article",
  "aside",
  "button",
  "code",
  "div",
  "em",
  "footer",
  "form",
  "h1",
  "h2",
  "h3",
  "h4",
  "h5",
  "h6",
  "header",
  "img",
  "input",
  "kbd",
  "label",
  "li",
  "nav",
  "ol",
  "option",
  "p",
  "pre",
  "section",
  "select",
  "small",
  "span",
  "strong",
  "svg",
  "table",
  "td",
  "textarea",
  "th",
  "tr",
  "ul",
]);

function walk(dir: string, pred: (name: string) => boolean): string[] {
  const out: string[] = [];
  for (const ent of readdirSync(dir, { withFileTypes: true })) {
    const p = join(dir, ent.name);
    if (ent.isDirectory()) out.push(...walk(p, pred));
    else if (pred(ent.name)) out.push(p);
  }
  return out;
}

function stripComments(src: string): string {
  return src.replace(/\/\*[\s\S]*?\*\//g, "").replace(/(^|\s)\/\/.*$/gm, "$1");
}

function nativeDomTitles(src: string, file: string): string[] {
  const hits: string[] = [];
  const re = /\btitle\s*=/g;
  let m: RegExpExecArray | null;
  while ((m = re.exec(src))) {
    const before = src.slice(Math.max(0, m.index - 1200), m.index);
    const lastOpen = before.lastIndexOf("<");
    if (lastOpen < 0) continue;
    const tagMatch = before.slice(lastOpen).match(/^<([A-Za-z][A-Za-z0-9]*)/);
    if (!tagMatch) continue;
    const tag = tagMatch[1];
    if (tag === "iframe") continue;
    if (!HTML_TAGS.has(tag)) continue;
    const line = src.slice(0, m.index).split("\n").length;
    hits.push(`${relative(root, file)}:${line}: <${tag} title=`);
  }
  return hits;
}

function visibleCjk(file: string): string[] {
  const rel = relative(root, file);
  const src = stripComments(readFileSync(file, "utf8"));
  const hits: string[] = [];
  src.split("\n").forEach((line, i) => {
    if (!CJK.test(line)) return;
    if (rel.endsWith("Settings.tsx") && /\b(show|hay)\(/.test(line)) return;
    if (/^\s*"[^"]*":\s*"palette\.group\./.test(line)) return;
    hits.push(`${rel}:${i + 1}: ${line.trim().slice(0, 140)}`);
  });
  return hits;
}

describe("round 3 leftovers", () => {
  it("#209 uses data-tip instead of native title= on DOM nodes", () => {
    const files = walk(srcRoot, (name) => name.endsWith(".tsx") && !name.endsWith(".test.tsx"));
    const hits = files.flatMap((file) => nativeDomTitles(readFileSync(file, "utf8"), file));
    expect(hits).toEqual([]);
  });

  it("#218 has no leftover CJK chrome in production tsx", () => {
    const files = walk(srcRoot, (name) => name.endsWith(".tsx") && !name.endsWith(".test.tsx"));
    const hits = files.flatMap(visibleCjk);
    expect(hits).toEqual([]);
  });

  it("#244 gitignores prototype/ and design/", () => {
    const gi = readFileSync(join(root, ".gitignore"), "utf8");
    expect(gi).toMatch(/^\s*prototype\/\s*$/m);
    expect(gi).toMatch(/^\s*design\/\s*$/m);
  });

  it("#246 keeps useAppModel.ts under the 800-line house limit", () => {
    const src = readFileSync(join(root, "src/hooks/useAppModel.ts"), "utf8");
    expect(src.split("\n").length).toBeLessThanOrEqual(800);
  });

  it("#247 has Playwright smoke, a script, and a CI step", () => {
    const pkg = JSON.parse(readFileSync(join(root, "package.json"), "utf8")) as {
      scripts?: Record<string, string>;
      devDependencies?: Record<string, string>;
    };
    expect(pkg.scripts?.["test:e2e"]).toMatch(/playwright/);
    expect(pkg.devDependencies?.["@playwright/test"]).toBeTruthy();
    expect(existsSync(join(root, "playwright.config.ts"))).toBe(true);
    expect(existsSync(join(root, "e2e"))).toBe(true);
    const specs = walk(join(root, "e2e"), (name) => name.endsWith(".ts") || name.endsWith(".js"));
    expect(specs.length).toBeGreaterThan(0);
    const ci = readFileSync(join(root, ".github/workflows/ci.yml"), "utf8");
    expect(ci).toMatch(/test:e2e|playwright/);
  });
});
