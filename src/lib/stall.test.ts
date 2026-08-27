import { describe, expect, it } from "vitest";
import {
  activityKey,
  stallLevel,
  stallNote,
  STALL_HARD_MS,
  STALL_WARN_MS,
} from "./stall";

describe("stallLevel", () => {
  it("is ok while output keeps arriving", () => {
    expect(stallLevel(0)).toBe("ok");
    expect(stallLevel(STALL_WARN_MS - 1)).toBe("ok");
  });

  it("warns at the quiet threshold", () => {
    expect(stallLevel(STALL_WARN_MS)).toBe("quiet");
    expect(stallLevel(STALL_HARD_MS - 1)).toBe("quiet");
  });

  it("escalates once it looks wedged", () => {
    expect(stallLevel(STALL_HARD_MS)).toBe("stuck");
    expect(stallLevel(STALL_HARD_MS * 5)).toBe("stuck");
  });
});

describe("stallNote", () => {
  it("says nothing while healthy", () => {
    expect(stallNote(0)).toBe("");
    expect(stallNote(STALL_WARN_MS - 1)).toBe("");
  });

  it("counts seconds while quiet", () => {
    expect(stallNote(20_000)).toBe("已 20 秒没有新输出");
  });

  it("counts minutes and names the suspicion once wedged", () => {
    expect(stallNote(120_000)).toBe("已 2 分钟没有新输出，可能卡住了");
  });
});

describe("activityKey", () => {
  it("changes when a new item arrives", () => {
    expect(activityKey(3, 10, "ok")).not.toBe(activityKey(4, 10, "ok"));
  });

  it("changes when the streaming item grows", () => {
    expect(activityKey(3, 10, "ok")).not.toBe(activityKey(3, 11, "ok"));
  });

  it("changes when a tool status flips", () => {
    expect(activityKey(3, 10, "pending")).not.toBe(activityKey(3, 10, "completed"));
  });

  it("is stable when nothing moved", () => {
    expect(activityKey(3, 10, "ok")).toBe(activityKey(3, 10, "ok"));
  });
});
