import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";
import { FileListRow } from "./FileListRow";

const here = dirname(fileURLToPath(import.meta.url));

function source(rel: string): string {
  return readFileSync(join(here, rel), "utf8");
}

function ruleBlock(css: string, selector: string): string {
  const escaped = selector.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
  const match = css.match(new RegExp(`${escaped}\\s*(?:,[^{]+)?\\{`));
  expect(match?.index, `missing rule ${selector}`).toBeGreaterThan(-1);
  const open = match!.index! + match![0].length - 1;
  let depth = 0;
  for (let i = open; i < css.length; i++) {
    if (css[i] === "{") depth++;
    if (css[i] === "}") {
      depth--;
      if (depth === 0) return css.slice(open + 1, i);
    }
  }
  throw new Error(`unclosed rule ${selector}`);
}

describe("FileListRow Finder button", () => {
  it("keeps the Finder control in the DOM and tags it file-finder", () => {
    const html = renderToStaticMarkup(
      createElement(FileListRow, {
        name: "App.tsx",
        path: "/work/App.tsx",
        onOpen: () => {},
        onReveal: () => {},
      }),
    );
    expect(html).toContain('aria-label="在访达中打开"');
    expect(html).toMatch(/class="file-open file-finder"/);
  });

  it("does not put file-finder on trailing discard/refresh actions", () => {
    const html = renderToStaticMarkup(
      createElement(FileListRow, {
        name: "git.ts",
        path: "src/lib/git.ts",
        onOpen: () => {},
        onReveal: () => {},
        trailing: createElement(
          "button",
          { type: "button", className: "file-open change-discard" },
          "丢弃",
        ),
      }),
    );
    expect(html).toMatch(/class="file-open change-discard"/);
    expect(html.match(/file-finder/g)?.length).toBe(1);
  });
});

describe("ExplorerPane dir Finder button", () => {
  it("tags the directory reveal control file-finder", () => {
    const src = source("./ExplorerPane.tsx");
    expect(src).toMatch(/className="file-open file-finder"/);
  });
});

describe("file-finder hover CSS", () => {
  const css = source("../styles.css");

  it("hides Finder icons until the row is hovered or focused", () => {
    expect(ruleBlock(css, ".file-entry .file-finder")).toMatch(/opacity:\s*0/);
    expect(ruleBlock(css, ".file-entry:hover .file-finder")).toMatch(/opacity:\s*1/);
    expect(ruleBlock(css, ".file-entry:focus-within .file-finder")).toMatch(/opacity:\s*1/);
    expect(ruleBlock(css, ".file-finder:focus-visible")).toMatch(/opacity:\s*1/);
  });

  it("does not hide every .file-open inside a file row", () => {
    expect(css).not.toMatch(/\.file-entry\s+\.file-open\s*\{[^}]*opacity:\s*0/);
  });

  it("keeps the 22px Finder hit target", () => {
    const open = ruleBlock(css, ".file-open");
    expect(open).toMatch(/min-width:\s*22px/);
    expect(open).toMatch(/min-height:\s*22px/);
  });
});
