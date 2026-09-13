import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";

describe(".gitignore", () => {
  const text = readFileSync(join(dirname(fileURLToPath(import.meta.url)), "../../.gitignore"), "utf8");
  const lines = new Set(
    text
      .split(/\r?\n/)
      .map((line) => line.trim().replace(/\/$/, ""))
      .filter((line) => line && !line.startsWith("#")),
  );

  it("ignores tsbuildinfo, dist, rust target, and installer artifacts", () => {
    for (const entry of ["*.tsbuildinfo", "dist", "src-tauri/target", "*.dmg", "*.app", "*.msi", "*.exe"]) {
      expect(lines.has(entry)).toBe(true);
    }
  });
});
