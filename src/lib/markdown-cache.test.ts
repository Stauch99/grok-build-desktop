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

  it("evicts the oldest entry when the 81st unique key is added", async () => {
    const { memoizeMarkdown } = await loadCache();
    let calls = 0;
    const toSrc = () => {
      calls += 1;
      return `asset://n-${calls}`;
    };
    const text = (i: number) => `![n](/img/${i}.png)`;
    for (let i = 0; i < 80; i++) memoizeMarkdown(text(i), "/cwd", toSrc);
    const afterFill = calls;
    memoizeMarkdown(text(79), "/cwd", toSrc);
    expect(calls).toBe(afterFill);

    memoizeMarkdown(text(80), "/cwd", toSrc);
    const afterEvict = calls;
    memoizeMarkdown(text(0), "/cwd", toSrc);
    expect(calls).toBeGreaterThan(afterEvict);
  });
});
