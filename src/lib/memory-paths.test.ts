import { describe, expect, it } from "vitest";
import {
  dailyMdPath,
  dailyShardPath,
  DAILY_MAX_SHARDS,
  dreamsMdPath,
  foundingDomainPath,
  foundingEpisodePath,
  memoryStatePath,
  skillProposalPath,
  userMdPath,
} from "./memory-paths";

describe("memory-paths", () => {
  it("uses the locked filenames", () => {
    const root = "/tmp/memory";
    expect(userMdPath(root)).toBe("/tmp/memory/USER.md");
    expect(dreamsMdPath(root)).toBe("/tmp/memory/DREAMS.md");
    expect(dailyMdPath(root, "2026-08-30")).toBe("/tmp/memory/daily/2026-08-30.md");
    expect(memoryStatePath(root)).toBe("/tmp/memory/.dreams/state.json");
    expect(foundingEpisodePath(root, 1)).toBe("/tmp/memory/.dreams/founding/_episodes.1.md");
    expect(foundingDomainPath(root, "GlobalEdu")).toBe("/tmp/memory/.dreams/founding/GlobalEdu.md");
    expect(skillProposalPath(root, "scheme-pdf")).toBe("/tmp/memory/skill-proposals/scheme-pdf.md");
  });
});

describe("dailyShardPath", () => {
  it("shard 1 is the canonical daily file", () => {
    expect(dailyShardPath("/tmp/memory", "2026-09-08", 1)).toBe(dailyMdPath("/tmp/memory", "2026-09-08"));
    expect(dailyShardPath("/tmp/memory", "2026-09-08", 2)).toBe("/tmp/memory/daily/2026-09-08.2.md");
  });

  it("rejects out-of-range shard index", () => {
    expect(() => dailyShardPath("/tmp/memory", "2026-09-08", 0)).toThrow();
    expect(() => dailyShardPath("/tmp/memory", "2026-09-08", DAILY_MAX_SHARDS + 1)).toThrow();
  });
});
