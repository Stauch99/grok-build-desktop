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
    expect(src).toContain("DREAM_LOOKBACK_DAYS");
    expect(src).toContain("loadLookbackDays");
    expect(src).toContain("selectDreamInput(lookback, day)");
  });

  it("gather merges ingest into today's shards then main uses lookback", () => {
    const gatherStart = src.indexOf('if (phase === "gather")');
    const gather = src.slice(gatherStart, src.indexOf("const lookback"));
    expect(gather).toContain("applyGrokIngest(current, pages, day, snap.memoryRoot, shards)");
    expect(gather).toContain("shards = ingested.shards");
    expect(src).toContain("todayShards: shards");
    expect(src).toContain("selectDreamInput(lookback, day)");
    expect(src).not.toContain("selectDreamInput(dailyDays(");
  });

  it("drains backlog with a bounded backfill loop on manual and first launch", () => {
    expect(src).toContain("BACKFILL_MAX_SWEEPS");
    expect(src).toContain("nextBackfillAction");
    expect(src).toContain("backfillEligible");
    expect(src).toContain("unconsumedPageCount");
    expect(src).toContain("stoppedEarly");
    expect(src).not.toMatch(/result\.started \? 0 : pendingMaterial/);
  });

  it("starts first-launch catch-up as manual so eager ingest cannot no-material the gate", () => {
    const catchUp = src.slice(src.indexOf("catchUpTried.current"), src.indexOf("Accumulation trigger"));
    expect(catchUp).toContain("lastDeepAt === null");
    expect(catchUp).toContain('runSweep("manual")');
    expect(catchUp).not.toContain('runSweep("launch")');
  });

  it("does not persist a follow-up lastScanAt null when the sweep never started", () => {
    expect(src).toContain("sweepStateToPersist");
    expect(src).toContain("previousLastScanAt");
    expect(src).toContain("lastScanAt: null");
  });
});
