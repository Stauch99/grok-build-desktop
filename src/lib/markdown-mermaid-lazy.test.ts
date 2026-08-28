import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";

const here = dirname(fileURLToPath(import.meta.url));
const markdownSrc = readFileSync(join(here, "../components/Markdown.tsx"), "utf8");

describe("Markdown mermaid loading", () => {
  it("does not statically import mermaid or the eager MermaidBlock", () => {
    expect(markdownSrc).not.toMatch(/from ["']mermaid["']/);
    expect(markdownSrc).not.toMatch(/from ["']\.\.\/MermaidBlock["']/);
  });

  it("lazy-loads MermaidBlock inside Suspense only for mermaid fences", () => {
    expect(markdownSrc).toMatch(/lazy\(/);
    expect(markdownSrc).toMatch(/Suspense/);
    expect(markdownSrc).toMatch(/kind === ["']mermaid["']/);
  });
});
