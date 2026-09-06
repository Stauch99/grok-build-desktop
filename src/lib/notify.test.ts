import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";
import {
  badgeCount,
  isSessionFocused,
  notifyText,
  shouldMarkUnread,
  shouldNotify,
  SHORT_TURN_MS,
  freshPermissionEvents,
} from "./notify";

const root = join(dirname(fileURLToPath(import.meta.url)), "../..");

describe("isSessionFocused", () => {
  it("treats a missing event session as the one you are watching", () => {
    expect(isSessionFocused("a", null)).toBe(true);
    expect(isSessionFocused("a", undefined)).toBe(true);
  });

  it("matches the focused session id", () => {
    expect(isSessionFocused("a", "a")).toBe(true);
    expect(isSessionFocused("a", "b")).toBe(false);
  });
});

describe("shouldNotify", () => {
  it("never interrupts the session you are looking at", () => {
    expect(
      shouldNotify({ reason: "permission", windowFocused: true, sessionFocused: true }),
    ).toBe(false);
    expect(
      shouldNotify({
        reason: "turn-done",
        windowFocused: true,
        sessionFocused: true,
        elapsedMs: 10 * 60_000,
      }),
    ).toBe(false);
  });

  it("notifies when another session needs permission, even if the window is focused", () => {
    expect(
      shouldNotify({ reason: "permission", windowFocused: true, sessionFocused: false }),
    ).toBe(true);
  });

  it("notifies when a background session finishes, even for a short turn", () => {
    expect(
      shouldNotify({
        reason: "turn-done",
        windowFocused: true,
        sessionFocused: false,
        elapsedMs: 800,
      }),
    ).toBe(true);
  });

  it("always notifies for a blocked permission prompt when the window is in the background", () => {
    expect(
      shouldNotify({ reason: "permission", windowFocused: false, sessionFocused: true }),
    ).toBe(true);
  });

  it("stays quiet for short turns on the focused session while the window is in the background", () => {
    expect(
      shouldNotify({
        reason: "turn-done",
        windowFocused: false,
        sessionFocused: true,
        elapsedMs: SHORT_TURN_MS - 1,
      }),
    ).toBe(false);
  });

  it("notifies for long turns on the focused session while the window is in the background", () => {
    expect(
      shouldNotify({
        reason: "turn-done",
        windowFocused: false,
        sessionFocused: true,
        elapsedMs: SHORT_TURN_MS,
      }),
    ).toBe(true);
  });
});

describe("freshPermissionEvents", () => {
  it("only yields each permission once, including after another is dismissed", () => {
    const seen = new Set<string>();
    const a = { rpcId: 1, sessionId: "s1" };
    const b = { rpcId: 2, sessionId: "s2" };
    expect(freshPermissionEvents(seen, [a])).toEqual([a]);
    expect(freshPermissionEvents(seen, [a])).toEqual([]);
    expect(freshPermissionEvents(seen, [a, b])).toEqual([b]);
    expect(freshPermissionEvents(seen, [b])).toEqual([]);
  });
});

describe("shouldMarkUnread", () => {
  it("marks a session unread when you were looking at another one", () => {
    expect(shouldMarkUnread(true, false)).toBe(true);
    expect(shouldMarkUnread(false, true)).toBe(true);
    expect(shouldMarkUnread(true, true)).toBe(false);
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

describe("desktop chrome", () => {
  it("does not ship a menu bar tray icon", () => {
    const cargo = readFileSync(join(root, "src-tauri/Cargo.toml"), "utf8");
    const lib = readFileSync(join(root, "src-tauri/src/lib.rs"), "utf8");
    const caps = readFileSync(join(root, "src-tauri/capabilities/default.json"), "utf8");
    expect(cargo).not.toMatch(/tray-icon/);
    expect(lib).not.toMatch(/build_tray|TrayIconBuilder|set_tray_status/);
    expect(caps).not.toMatch(/core:tray/);
  });
});
