import { beforeEach, describe, expect, it, vi } from "vitest";

async function loadCache() {
  return import("./markdown-cache");
}

describe("memoizeMarkdown", () => {
  beforeEach(() => {
    vi.resetModules();
  });

  it("returns the same HTML for the same cache key without re-rendering", async () => {
    const { memoizeMarkdown } = await loadCache();
    let calls = 0;
    const toSrc = (path: string) => {
      calls += 1;
      return `asset://${path}`;
    };
    const a = memoizeMarkdown("![cover](/work/cover.png)", "/work", toSrc);
    const b = memoizeMarkdown("![cover](/work/cover.png)", "/work", toSrc);
    expect(a).toBe(b);
    expect(a).toContain('src="asset:///work/cover.png"');
    expect(calls).toBe(1);
  });

  it("evicts the oldest entry when the cache grows past the LRU cap", async () => {
    const { memoizeMarkdown, MARKDOWN_CACHE_MAX } = await loadCache();
    let calls = 0;
    const toSrc = () => {
      calls += 1;
      return `asset://n-${calls}`;
    };
    const text = (i: number) => `![n](/img/${i}.png)`;
    for (let i = 0; i < MARKDOWN_CACHE_MAX; i++) memoizeMarkdown(text(i), "/cwd", toSrc);
    const afterFill = calls;
    memoizeMarkdown(text(MARKDOWN_CACHE_MAX - 1), "/cwd", toSrc);
    expect(calls).toBe(afterFill);

    memoizeMarkdown(text(MARKDOWN_CACHE_MAX), "/cwd", toSrc);
    const afterEvict = calls;
    memoizeMarkdown(text(0), "/cwd", toSrc);
    expect(calls).toBeGreaterThan(afterEvict);
    expect(MARKDOWN_CACHE_MAX).toBe(400);
  });
});
