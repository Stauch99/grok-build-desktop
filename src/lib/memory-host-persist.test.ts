import { describe, expect, it } from "vitest";
import type { MemoryHostPatch } from "../api";
import { MEMORY_FILE_MAX_BYTES, utf8Bytes } from "./memory-ingest";
import { emptyMemoryState } from "./memory-state";
import {
  persistDailyShards,
  persistDreamFiles,
  persistIngest,
  persistState,
} from "./memory-host-persist";

function recorder(rejectDailyOver = Infinity) {
  const calls: MemoryHostPatch[] = [];
  const successful: MemoryHostPatch[] = [];
  const write = async (patch: MemoryHostPatch) => {
    calls.push(patch);
    if (patch.dailyMd && patch.dailyMd.length > rejectDailyOver) {
      throw new Error("file exceeds 64 KiB size limit");
    }
    successful.push(patch);
  };
  return { calls, successful, write };
}

describe("persistState", () => {
  it("writes a state-only patch and returns stateJson", async () => {
    const { calls, write } = recorder();
    const state = { ...emptyMemoryState(), cursors: { "grok/s1": 42 } };
    const result = await persistState(state, { write });
    expect(result).toEqual({ stateJson: JSON.stringify(state) });
    expect(calls).toEqual([{ stateJson: JSON.stringify(state) }]);
  });
});

describe("persistDailyShards", () => {
  it("writes one patch per shard and nothing else", async () => {
    const { calls, write } = recorder();
    await persistDailyShards("2026-09-08", { 1: "# 2026-09-08\na\n", 2: "# 2026-09-08\nb\n" }, { write });
    expect(calls).toEqual([
      { dailyMd: "# 2026-09-08\na\n", dailyDay: "2026-09-08", dailyShard: 1 },
      { dailyMd: "# 2026-09-08\nb\n", dailyDay: "2026-09-08", dailyShard: 2 },
    ]);
    expect(calls.every((c) => !("stateJson" in c) && !("userMd" in c) && !("dreamsMd" in c))).toBe(true);
  });
});

describe("persistDreamFiles", () => {
  it("writes userMd, dreamsMd, and stateJson without dailyMd", async () => {
    const { calls, write } = recorder();
    const state = emptyMemoryState();
    await persistDreamFiles({ userMd: "# You\n", dreamsMd: "## 2026-09-08\n", state }, { write });
    expect(calls).toHaveLength(1);
    expect(calls[0]).toEqual({
      userMd: "# You\n",
      dreamsMd: "## 2026-09-08\n",
      stateJson: JSON.stringify(state),
    });
    expect(calls[0]?.dailyMd).toBeUndefined();
  });

  it("does not persist empty USER.md", async () => {
    const { calls, write } = recorder();
    await persistDreamFiles({ userMd: "", dreamsMd: "## 2026-09-08\n", state: emptyMemoryState() }, { write });
    expect(calls[0]?.userMd).toBeUndefined();
    expect(calls[0]?.dreamsMd).toBe("## 2026-09-08\n");
  });
});

describe("persistIngest", () => {
  it("writes shards then a state-only patch", async () => {
    const { calls, write } = recorder();
    const state = { ...emptyMemoryState(), cursors: { "grok/s1": 9 } };
    await persistIngest({
      write,
      day: "2026-09-08",
      shards: { 1: "# 2026-09-08\n", 2: "# 2026-09-08\n- b\n" },
      state,
    });
    expect(calls[0]).toEqual({ dailyMd: "# 2026-09-08\n", dailyDay: "2026-09-08", dailyShard: 1 });
    expect(calls[1]).toEqual({ dailyMd: "# 2026-09-08\n- b\n", dailyDay: "2026-09-08", dailyShard: 2 });
    expect(calls[2]).toEqual({ stateJson: JSON.stringify(state) });
  });

  it("writes stateJson after a rejected daily patch", async () => {
    const calls: unknown[] = [];
    const write = async (patch: MemoryHostPatch) => {
      calls.push(patch);
      if (patch.dailyMd && patch.dailyMd.length > 10) throw new Error("file exceeds 64 KiB size limit");
    };
    await persistIngest({ write, day: "2026-09-08", shards: { 1: "x".repeat(20) }, state: emptyMemoryState() });
    expect(calls.some((c) => c && typeof c === "object" && "stateJson" in c && !("dailyMd" in c && (c as MemoryHostPatch).dailyMd))).toBe(true);
  });

  it("last successful call after a daily reject is stateJson without oversized dailyMd", async () => {
    const { calls, successful, write } = recorder(10);
    const state = { ...emptyMemoryState(), cursors: { "grok/s1": 7 } };
    await persistIngest({ write, day: "2026-09-08", shards: { 1: "x".repeat(20) }, state });
    expect(successful.length).toBeGreaterThan(0);
    const last = successful[successful.length - 1];
    expect(last?.stateJson).toBe(JSON.stringify(state));
    expect(last?.dailyMd).toBeUndefined();
    expect(calls.some((c) => c.dailyMd && c.dailyMd.length > 10)).toBe(true);
    expect(utf8Bytes(last?.stateJson ?? "")).toBeLessThanOrEqual(MEMORY_FILE_MAX_BYTES);
  });

  it("does not send a successful patch with dailyMd over MEMORY_FILE_MAX_BYTES", async () => {
    const { successful, write } = recorder();
    const huge = "x".repeat(MEMORY_FILE_MAX_BYTES + 8);
    expect(utf8Bytes(huge)).toBeGreaterThan(MEMORY_FILE_MAX_BYTES);
    await persistIngest({ write, day: "2026-09-08", shards: { 1: huge }, state: emptyMemoryState() });
    expect(successful.every((c) => !c.dailyMd || utf8Bytes(c.dailyMd) <= MEMORY_FILE_MAX_BYTES)).toBe(true);
    expect(successful.some((c) => c.stateJson && !c.dailyMd)).toBe(true);
  });
});
