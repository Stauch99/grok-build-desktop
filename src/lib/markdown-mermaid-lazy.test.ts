import { readdirSync, readFileSync, statSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";

const here = dirname(fileURLToPath(import.meta.url));
const srcRoot = join(here, "..");
const markdownSrc = readFileSync(join(srcRoot, "components/Markdown.tsx"), "utf8");

function srcFiles(dir = srcRoot): string[] {
  return readdirSync(dir).flatMap((name) => {
    const p = join(dir, name);
    return statSync(p).isDirectory() ? srcFiles(p) : [p];
  });
}

describe("Markdown mermaid loading", () => {
  it("does not statically import mermaid or the eager MermaidBlock", () => {
    expect(markdownSrc).not.toMatch(/from ["']mermaid["']/);
    expect(markdownSrc).not.toMatch(/from ["']\.\.\/MermaidBlock["']/);
    expect(srcFiles().filter((f) => /from ["']mermaid["']/.test(readFileSync(f, "utf8")))).toEqual([]);
  });

  it("lazy-loads MermaidBlock inside Suspense only for mermaid fences", () => {
    expect(markdownSrc).toMatch(/lazy\(/);
    expect(markdownSrc).toMatch(/Suspense/);
    expect(markdownSrc).toMatch(/kind === ["']mermaid["']/);
  });
});
