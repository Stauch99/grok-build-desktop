import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";
import { replaceAbortController, reviewOwnerAdopted, reviewOwnerKey, resolveReviewPath, shouldSkipRememberOnOwnerChange, validateReviewFallbackTarget } from "./useReviewController";

const src = readFileSync(join(dirname(fileURLToPath(import.meta.url)), "./useReviewController.ts"), "utf8");

describe("review controller helpers", () => {
  it("resolves relative paths and preserves POSIX, drive, and UNC absolute paths", () => {
    expect(resolveReviewPath("src/App.tsx", "/work/project")).toBe("/work/project/src/App.tsx");
    expect(resolveReviewPath("assets/archive.zip", "/work/project")).toBe("/work/project/assets/archive.zip");
    expect(resolveReviewPath("/work/project/App.tsx", "/other")).toBe("/work/project/App.tsx");
    expect(resolveReviewPath("C:\\work\\App.tsx", "C:\\other")).toBe("C:\\work\\App.tsx");
    expect(resolveReviewPath("\\\\server\\share\\file.md", "C:\\other")).toBe("\\\\server\\share\\file.md");
  });

  it("keys ownership by session and cwd", () => {
    expect(reviewOwnerKey("a", "/one")).not.toBe(reviewOwnerKey("a", "/two"));
    expect(reviewOwnerKey("a", "/one")).not.toBe(reviewOwnerKey("b", "/one"));
  });

  it("treats a new chat gaining a session id as the same owner, not a reset", () => {
    expect(reviewOwnerAdopted("|/work", "s1|/work")).toBe(true);
    expect(reviewOwnerAdopted("s1|/work", "s2|/work")).toBe(false);
    expect(reviewOwnerAdopted("|/work", "s1|/other")).toBe(false);
    expect(reviewOwnerAdopted("s1|/work", "s1|/work")).toBe(false);
  });

  it("only skips tab memory when the recalled tab actually changes", () => {
    expect(shouldSkipRememberOnOwnerChange("explorer", "git")).toBe(true);
    expect(shouldSkipRememberOnOwnerChange("explorer", "explorer")).toBe(false);
  });

  it("aborts in-flight work when the session owner is replaced", () => {
    const first = replaceAbortController(null);
    expect(first.signal.aborted).toBe(false);
    const next = replaceAbortController(first);
    expect(first.signal.aborted).toBe(true);
    expect(next.signal.aborted).toBe(false);
  });

  it("allows only ordinary local review fallback targets", () => {
    expect(validateReviewFallbackTarget("/work/project/assets/archive.zip", "/work/project")).toBeNull();
    expect(validateReviewFallbackTarget("https://example.com/a.zip", "/work/project")).toMatch(/URL/);
    expect(validateReviewFallbackTarget("/work/Other.app", "/work")).toMatch(/应用|执行/);
    expect(validateReviewFallbackTarget("/outside/archive.zip", "/work/project")).toMatch(/工作区/);
  });

  it("restores preview files and explorer folders when the session owner changes", () => {
    expect(src).toMatch(/rememberReviewPane/);
    expect(src).toMatch(/recalledReviewPane/);
    expect(src).toMatch(/pendingRestore/);
    expect(src).not.toMatch(/setPreviewTabs\(\[\]\)/);
  });

  it("revealPath opens the validated path instead of returning after the check", () => {
    const block = src.match(/const revealPath = useCallback\(async \(path: string\) => \{[\s\S]*?\n  \}, \[/);
    expect(block?.[0]).toContain("await deps.openReviewPath(resolvedPath, deps.cwd)");
  });
});
