import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";

const root = join(dirname(fileURLToPath(import.meta.url)), "../..");

function css(rel: string): string {
  return readFileSync(join(root, rel), "utf8");
}

describe("keyboard focus", () => {
  it("keeps a visible :focus-visible outline on form controls", () => {
    const src = css("src/styles.css");
    const block = src.match(/\/\* ---- keyboard focus ---- \*\/[\s\S]*?(?=\n\/\* ----|$)/)?.[0] ?? "";
    expect(block).toMatch(/:focus-visible\s*\{[^}]*outline:\s*1px solid/);
    expect(block).toMatch(/\.composer textarea:focus-visible/);
    expect(block).not.toMatch(/textarea:focus-visible[^}]*outline:\s*none/);
  });
});

describe("settings dialog height", () => {
  it("does not force hub and extra overlays to the settings 82vh height", () => {
    const src = css("src/styles/settings.css");
    const dialog = src.match(/^\.settings-dialog\s*\{[^}]+\}/m)?.[0] ?? "";
    expect(dialog).not.toMatch(/height:\s*min\(82vh/);
    expect(src).toMatch(/\.settings-layer\s*>\s*\.settings-dialog\s*\{[^}]*height:\s*min\(82vh/);
  });
});

describe("compact density", () => {
  it("keeps persisted compact type and spacing overrides", () => {
    expect(css("src/styles/tokens.css")).toMatch(/:root\[data-density="compact"\]\s*\{[^}]*--ui-small:\s*12px/);
    expect(css("src/styles/composer.css")).toMatch(/:root\[data-density="compact"\]\s+\.composer\s*\{[^}]*padding:/);
    expect(css("src/styles/thread.css")).toMatch(/:root\[data-density="compact"\]\s+\.msg\s*\{/);
  });
});
