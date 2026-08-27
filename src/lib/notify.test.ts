import { describe, expect, it } from "vitest";
import { badgeCount, notifyText, shouldNotify, SHORT_TURN_MS, trayStatus } from "./notify";

describe("shouldNotify", () => {
  it("never interrupts a focused window", () => {
    expect(shouldNotify({ reason: "permission", focused: true })).toBe(false);
    expect(
      shouldNotify({ reason: "turn-done", focused: true, elapsedMs: 10 * 60_000 }),
    ).toBe(false);
  });

  it("always notifies for a blocked permission prompt", () => {
    expect(shouldNotify({ reason: "permission", focused: false })).toBe(true);
  });

  it("stays quiet for short turns", () => {
    expect(
      shouldNotify({ reason: "turn-done", focused: false, elapsedMs: SHORT_TURN_MS - 1 }),
    ).toBe(false);
  });

  it("notifies for long turns", () => {
    expect(
      shouldNotify({ reason: "turn-done", focused: false, elapsedMs: SHORT_TURN_MS }),
    ).toBe(true);
  });
});

describe("notifyText", () => {
  it("labels a permission prompt", () => {
    expect(notifyText("permission", "修登录", "写文件")).toEqual({
      title: "需要许可",
      body: "修登录 · 写文件",
    });
  });

  it("labels a finished turn", () => {
    expect(notifyText("turn-done", "修登录").title).toBe("任务完成");
  });

  it("falls back when the title is blank", () => {
    expect(notifyText("turn-done", "   ").body).toBe("会话");
  });
});

describe("badgeCount", () => {
  it("adds permissions and unseen completions", () => {
    expect(badgeCount(1, 2)).toBe(3);
  });

  it("clamps negatives away", () => {
    expect(badgeCount(-3, 0)).toBe(0);
  });
});

describe("trayStatus", () => {
  it("prefers the permission count", () => {
    expect(trayStatus(true, 2)).toBe("● 待许可 2");
  });

  it("shows running while busy", () => {
    expect(trayStatus(true, 0)).toBe("● 运行中");
  });

  it("is empty when idle", () => {
    expect(trayStatus(false, 0)).toBe("");
  });
});
