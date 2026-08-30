import { describe, expect, it } from "vitest";
import { dailyMdPath, dreamsMdPath, memoryStatePath, userMdPath } from "./memory-paths";

describe("memory-paths", () => {
  it("uses the locked filenames", () => {
    const root = "/tmp/memory";
    expect(userMdPath(root)).toBe("/tmp/memory/USER.md");
    expect(dreamsMdPath(root)).toBe("/tmp/memory/DREAMS.md");
    expect(dailyMdPath(root, "2026-08-30")).toBe("/tmp/memory/daily/2026-08-30.md");
    expect(memoryStatePath(root)).toBe("/tmp/memory/.dreams/state.json");
  });
});
