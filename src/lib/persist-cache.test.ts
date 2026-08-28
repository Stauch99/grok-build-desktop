import { describe, expect, it } from "vitest";
import {
  WEBUI_PERSIST_MS,
  WORKSPACE_WATCH_DEBOUNCE_MS,
  cacheHit,
  cacheStore,
  shouldSkipSave,
  watchPathIgnored,
} from "./persist-cache";

describe("cacheHit", () => {
  it("returns the stored value when the directory mtime is unchanged", () => {
    const cached = cacheStore(1_700_000_000_000, ["a", "b"]);
    expect(cacheHit(cached, 1_700_000_000_000)).toEqual(["a", "b"]);
  });

  it("misses when the directory mtime changes", () => {
    const cached = cacheStore(100, ["stale"]);
    expect(cacheHit(cached, 101)).toBeUndefined();
  });

  it("misses when there is no cache yet", () => {
    expect(cacheHit(null, 100)).toBeUndefined();
  });
});

describe("shouldSkipSave", () => {
  it("skips the write when the serialized string is identical", () => {
    expect(shouldSkipSave('{\n  "theme": "dark"\n}', '{\n  "theme": "dark"\n}')).toBe(true);
  });

  it("writes when the serialized string changed", () => {
    expect(shouldSkipSave('{\n  "theme": "dark"\n}', '{\n  "theme": "light"\n}')).toBe(false);
  });

  it("writes the first time there is no previous snapshot", () => {
    expect(shouldSkipSave(null, "{}")).toBe(false);
  });
});

describe("watch ignore and persist cadence", () => {
  it("ignores node_modules, .git, target, dist, and .next", () => {
    expect(watchPathIgnored("/proj/node_modules/pkg/index.js")).toBe(true);
    expect(watchPathIgnored("/proj/.git/HEAD")).toBe(true);
    expect(watchPathIgnored("/proj/target/debug/app")).toBe(true);
    expect(watchPathIgnored("/proj/dist/index.js")).toBe(true);
    expect(watchPathIgnored("/proj/.next/cache")).toBe(true);
    expect(watchPathIgnored("/proj/src/lib/persist-cache.ts")).toBe(false);
  });

  it("debounces webui persist at 500 ms and workspace events at 300 ms", () => {
    expect(WEBUI_PERSIST_MS).toBe(500);
    expect(WORKSPACE_WATCH_DEBOUNCE_MS).toBe(300);
  });
});
