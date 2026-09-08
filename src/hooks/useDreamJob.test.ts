import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";

const src = readFileSync(join(dirname(fileURLToPath(import.meta.url)), "./useDreamJob.ts"), "utf8");

describe("useDreamJob persist wiring", () => {
  it("does not use persistIo", () => {
    expect(src).not.toMatch(/\bpersistIo\b/);
    expect(src).not.toMatch(/\bwriteMemoryHost\b/);
  });

  it("ingests with persistIngest and lock with persistState", () => {
    expect(src).toContain("persistIngest({ day, shards");
    expect(src).toContain("await persistState(current.state)");
    expect(src).toContain("persistDreamFiles");
  });

  it("catch path persists failed post-ingest state only", () => {
    expect(src).toContain("postIngest");
    expect(src).toMatch(/lastStatus:\s*"failed"/);
    expect(src).toContain("await persistState(failed.state)");
    const catchBlock = src.slice(src.indexOf("const failed: DreamIo"));
    expect(catchBlock).toContain("persistState(failed.state)");
    expect(catchBlock).not.toContain("persistDreamFiles");
    expect(catchBlock).not.toContain("userMd:");
  });

  it("loads numbered daily shards and feeds them to selectDreamInput", () => {
    expect(src).toContain("dailyShardPath(memoryRoot, day, index)");
    expect(src).toContain("DAILY_MAX_SHARDS");
    expect(src).toContain("selectDreamInput(dailyDays(shards, day, current.dailyMd), day)");
  });
});
