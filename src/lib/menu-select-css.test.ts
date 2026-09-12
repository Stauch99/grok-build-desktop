import { describe, expect, it } from "vitest";
import { appCss } from "./css-source";

describe("MenuSelect vs composer chip-menu cascade", () => {
  it("overrides chip-menu bottom so the listbox can grow downward", () => {
    const css = appCss();
    const block = css.match(/\.chip-menu\.menu-select-list\s*\{[^}]+\}/)?.[0];
    expect(block).toBeTruthy();
    expect(block).toMatch(/bottom:\s*auto/);
    expect(block).toMatch(/top:\s*calc\(100%/);
  });
});
