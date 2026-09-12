import { existsSync, readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";

const root = join(dirname(fileURLToPath(import.meta.url)), "../..");

describe("release gates", () => {
  it("CI frontend job builds the UI", () => {
    const ci = readFileSync(join(root, ".github/workflows/ci.yml"), "utf8");
    expect(ci).toMatch(/npm run build/);
  });

  it("CI runs cargo test for the Tauri crate", () => {
    const ci = readFileSync(join(root, ".github/workflows/ci.yml"), "utf8");
    expect(ci).toMatch(/cargo test/);
  });

  it("CI clippy denies warnings without dropping the existing jobs", () => {
    const ci = readFileSync(join(root, ".github/workflows/ci.yml"), "utf8");
    expect(ci).toMatch(/cargo clippy/);
    expect(ci).toMatch(/-D warnings/);
    expect(ci).toMatch(/npm run typecheck/);
    expect(ci).toMatch(/test:e2e|playwright/);
  });

  it("schedules Dependabot and a weekly npm/cargo audit", () => {
    const dependabot = readFileSync(join(root, ".github/dependabot.yml"), "utf8");
    expect(dependabot).toMatch(/package-ecosystem: npm/);
    expect(dependabot).toMatch(/package-ecosystem: cargo/);
    const audit = readFileSync(join(root, ".github/workflows/audit.yml"), "utf8");
    expect(audit).toMatch(/npm audit/);
    expect(audit).toMatch(/cargo audit/);
  });

  it("keeps a changelog and checksums tagged releases", () => {
    expect(existsSync(join(root, "CHANGELOG.md"))).toBe(true);
    const changelog = readFileSync(join(root, "CHANGELOG.md"), "utf8");
    expect(changelog).toMatch(/## \[0\.6\.3]/);
    const release = readFileSync(join(root, ".github/workflows/release.yml"), "utf8");
    expect(release).toMatch(/SHA256SUMS/);
  });
});
