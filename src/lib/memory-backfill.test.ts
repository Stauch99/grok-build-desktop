import { describe, expect, it } from "vitest";
import { memoryCursorKey } from "./memory-clock";
import {
  BACKFILL_MAX_SWEEPS,
  backfillEligible,
  nextBackfillAction,
  sweepStateToPersist,
  unconsumedPageCount,
} from "./memory-backfill";

describe("BACKFILL_MAX_SWEEPS", () => {
  it("caps a catch-up run at 5 sweeps", () => {
    expect(BACKFILL_MAX_SWEEPS).toBe(5);
  });
});

describe("nextBackfillAction", () => {
  it("stops once sweepsDone reaches the cap even if work remains", () => {
    expect(
      nextBackfillAction({ sweepsDone: 4, stoppedEarly: true, pending: 9 }),
    ).toBe("again");
    expect(
      nextBackfillAction({ sweepsDone: BACKFILL_MAX_SWEEPS, stoppedEarly: true, pending: 9 }),
    ).toBe("stop");
    expect(
      nextBackfillAction({ sweepsDone: BACKFILL_MAX_SWEEPS + 1, stoppedEarly: true, pending: 9 }),
    ).toBe("stop");
  });

  it("stops on blocked-login or failed even when pending remains", () => {
    expect(
      nextBackfillAction({
        sweepsDone: 1,
        stoppedEarly: true,
        pending: 9,
        lastReason: "blocked-login",
      }),
    ).toBe("stop");
    expect(
      nextBackfillAction({
        sweepsDone: 1,
        stoppedEarly: true,
        pending: 9,
        lastReason: "failed",
      }),
    ).toBe("stop");
  });

  it("continues when ingest stopped early or pages remain", () => {
    expect(nextBackfillAction({ sweepsDone: 1, stoppedEarly: true, pending: 0 })).toBe("again");
    expect(nextBackfillAction({ sweepsDone: 1, stoppedEarly: false, pending: 2 })).toBe("again");
  });

  it("stops when the backlog is drained", () => {
    expect(nextBackfillAction({ sweepsDone: 1, stoppedEarly: false, pending: 0 })).toBe("stop");
  });

  it("drains at most BACKFILL_MAX_SWEEPS successful rounds", () => {
    let sweepsDone = 0;
    let action: "again" | "stop" = "again";
    while (action === "again") {
      sweepsDone += 1;
      action = nextBackfillAction({ sweepsDone, stoppedEarly: true, pending: 4 });
    }
    expect(sweepsDone).toBe(BACKFILL_MAX_SWEEPS);
    expect(action).toBe("stop");
  });
});

describe("backfillEligible", () => {
  it("loops on manual regardless of lastDeepAt", () => {
    expect(backfillEligible("manual", null)).toBe(true);
    expect(backfillEligible("manual", 1_000)).toBe(true);
  });

  it("loops on launch only when lastDeepAt is null", () => {
    expect(backfillEligible("launch", null)).toBe(true);
    expect(backfillEligible("launch", 1_000)).toBe(false);
  });

  it("does not loop on nightly or threshold triggers", () => {
    expect(backfillEligible("schedule", null)).toBe(false);
    expect(backfillEligible("threshold", null)).toBe(false);
  });
});

describe("unconsumedPageCount", () => {
  it("counts pages whose cursor has not reached nextByte", () => {
    const pages = [
      { sessionId: "s1", nextByte: 80 },
      { sessionId: "s2", nextByte: 40 },
      { sessionId: "s3", nextByte: 10 },
    ];
    const cursors = {
      [memoryCursorKey("grok", "s1")]: 80,
      [memoryCursorKey("grok", "s2")]: 10,
    };
    expect(unconsumedPageCount(pages, cursors, ["s3"])).toBe(1);
    expect(unconsumedPageCount(pages, cursors)).toBe(2);
  });
});

describe("sweepStateToPersist", () => {
  it("restores lastScanAt when a follow-up never started", () => {
    expect(
      sweepStateToPersist({ lastScanAt: null, lastStatus: "blocked-login" }, false, 1_700),
    ).toEqual({ lastScanAt: 1_700, lastStatus: "blocked-login" });
  });

  it("keeps the sweep state when the round started or it is not a follow-up", () => {
    expect(sweepStateToPersist({ lastScanAt: 9, lastStatus: "ok" }, true, 1_700)).toEqual({
      lastScanAt: 9,
      lastStatus: "ok",
    });
    expect(sweepStateToPersist({ lastScanAt: null, lastStatus: "ok" }, false, undefined)).toEqual({
      lastScanAt: null,
      lastStatus: "ok",
    });
  });
});
