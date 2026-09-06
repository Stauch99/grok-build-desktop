import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";

const src = readFileSync(
  join(dirname(fileURLToPath(import.meta.url)), "../components/DotMatrix.tsx"),
  "utf8",
);

describe("DotMatrix stagger", () => {
  it("uses a CSS --i custom property instead of 32 duration constants", () => {
    expect(src).toMatch(/--i/);
    expect(src).not.toMatch(/const DURATION/);
    expect(src).not.toMatch(/const DELAY/);
  });
});
