import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";

const root = join(dirname(fileURLToPath(import.meta.url)), "../..");

describe("MenuSelect vs composer chip-menu cascade", () => {
  it("overrides chip-menu bottom so the listbox can grow downward", () => {
    const css = readFileSync(join(root, "src/styles.css"), "utf8");
    const block = css.match(/\.chip-menu\.menu-select-list\s*\{[^}]+\}/)?.[0];
    expect(block).toBeTruthy();
    expect(block).toMatch(/bottom:\s*auto/);
    expect(block).toMatch(/top:\s*calc\(100%/);
  });
});
