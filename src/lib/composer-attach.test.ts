import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";

const root = dirname(fileURLToPath(import.meta.url));
const css = readFileSync(join(root, "../styles/composer.css"), "utf8");
const strip = readFileSync(join(root, "../components/AttachStrip.tsx"), "utf8");

const composer = readFileSync(join(root, "../components/Composer.tsx"), "utf8");

describe("composer IME enter", () => {
  it("ignores Enter while composing and after compositionend", () => {
    expect(composer).toContain("imeBlocksEnter");
    expect(composer).toContain("onCompositionStart");
    expect(composer).toContain("onCompositionEnd");
    expect(composer).toContain("e.nativeEvent.isComposing");
  });
});

describe("composer attachment chips", () => {
  it("scrolls chips horizontally instead of wrapping", () => {
    expect(css).toMatch(/\.attach-strip\s*\{[^}]*flex-wrap:\s*nowrap/s);
    expect(css).toMatch(/\.attach-strip\s*\{[^}]*overflow-x:\s*auto/s);
  });

  it("renders images as square thumbs and files as type-icon cards", () => {
    expect(css).toMatch(/\.attach-card\.is-thumb\s*\{[^}]*width:\s*56px/s);
    expect(css).toMatch(/\.attach-card\.is-thumb\s*\{[^}]*height:\s*56px/s);
    expect(strip).toContain("is-thumb");
    expect(strip).toContain("AttachKindIcon");
  });
});
