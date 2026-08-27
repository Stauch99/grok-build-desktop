import { describe, expect, it } from "vitest";
import { detectMemoryUpdates, formatMemoryLabel, selectRecent, type MemoryChange } from "./memory-dock";

describe("selectRecent", () => {
  const now = 1_700_000_100_000;

  it("returns newest first and unique by path", () => {
    const changes: MemoryChange[] = [
      { path: "/m/a.md", mtime: now - 3000 },
      { path: "/m/b.md", mtime: now - 1000 },
      { path: "/m/a.md", mtime: now - 500 },
      { path: "/m/c.md", mtime: now - 2000 },
    ];
    expect(selectRecent(changes, now)).toEqual([
      { path: "/m/a.md", mtime: now - 500 },
      { path: "/m/b.md", mtime: now - 1000 },
      { path: "/m/c.md", mtime: now - 2000 },
    ]);
  });

  it("respects limit default 8 and custom limit", () => {
    const changes: MemoryChange[] = Array.from({ length: 12 }, (_, i) => ({
      path: `/m/${i}.md`,
      mtime: now - i * 100,
    }));
    expect(selectRecent(changes, now)).toHaveLength(8);
    expect(selectRecent(changes, now, 3).map((c) => c.path)).toEqual([
      "/m/0.md",
      "/m/1.md",
      "/m/2.md",
    ]);
  });

  it("drops empty paths and future mtimes", () => {
    const changes: MemoryChange[] = [
      { path: "", mtime: now - 1 },
      { path: "/m/future.md", mtime: now + 1000 },
      { path: "/m/ok.md", mtime: now },
    ];
    expect(selectRecent(changes, now)).toEqual([{ path: "/m/ok.md", mtime: now }]);
  });

  it("returns empty for no usable changes", () => {
    expect(selectRecent([], now)).toEqual([]);
  });
});

describe("detectMemoryUpdates", () => {
  const now = 1_700_000_100_000;
  it("returns only new or newer files", () => {
    const baseline = { "/m/old.md": now - 5000, "/m/same.md": now - 2000 };
    const current = [
      { path: "/m/old.md", mtime: now - 1000 },
      { path: "/m/same.md", mtime: now - 2000 },
      { path: "/m/new.md", mtime: now - 100 },
    ];
    expect(detectMemoryUpdates(current, baseline, now).map((c) => c.path)).toEqual([
      "/m/new.md",
      "/m/old.md",
    ]);
  });
  it("is empty when nothing changed", () => {
    expect(detectMemoryUpdates([{ path: "/m/a.md", mtime: 10 }], { "/m/a.md": 10 }, 20)).toEqual([]);
  });
});

describe("formatMemoryLabel", () => {
  it("returns basename", () => {
    expect(formatMemoryLabel("/Users/foxie/.grok/memory/proj/MEMORY.md")).toBe("MEMORY.md");
    expect(formatMemoryLabel("notes.md")).toBe("notes.md");
  });
});
