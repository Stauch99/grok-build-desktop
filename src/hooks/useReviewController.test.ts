import { describe, expect, it } from "vitest";
import { reviewOwnerKey, resolveReviewPath, validateReviewFallbackTarget } from "./useReviewController";

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

  it("allows only ordinary local review fallback targets", () => {
    expect(validateReviewFallbackTarget("/work/project/assets/archive.zip", "/work/project")).toBeNull();
    expect(validateReviewFallbackTarget("https://example.com/a.zip", "/work/project")).toMatch(/URL/);
    expect(validateReviewFallbackTarget("/work/Other.app", "/work")).toMatch(/应用|执行/);
    expect(validateReviewFallbackTarget("/outside/archive.zip", "/work/project")).toMatch(/工作区/);
  });
});
