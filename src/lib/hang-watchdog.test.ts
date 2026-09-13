import { describe, expect, it } from "vitest";
import { evaluateHangWatchdog, HANG_WATCHDOG_MS } from "./hang-watchdog";
import type { ChatItem } from "./chat";

const user = (text: string): ChatItem => ({ kind: "user", id: "u1", text, at: 1 });
const tool = (status: "pending" | "completed"): ChatItem => ({
  kind: "tool",
  id: "t1",
  title: "bash",
  status,
  at: 1,
});

describe("evaluateHangWatchdog", () => {
  it("offers recovery after 90s quiet with no open tools", () => {
    const verdict = evaluateHangWatchdog({
      busy: true,
      nowMs: HANG_WATCHDOG_MS + 5,
      lastActivityMs: 0,
      items: [user("fix the build")],
      permissionPending: false,
    });
    expect(verdict.shouldOffer).toBe(true);
    expect(verdict.text).toBe("fix the build");
  });

  it("does not auto-heal while a tool is still running", () => {
    const verdict = evaluateHangWatchdog({
      busy: true,
      nowMs: HANG_WATCHDOG_MS + 5,
      lastActivityMs: 0,
      items: [user("fix"), tool("pending")],
      permissionPending: false,
    });
    expect(verdict.shouldOffer).toBe(false);
  });

  it("stays quiet during a permission prompt", () => {
    const verdict = evaluateHangWatchdog({
      busy: true,
      nowMs: HANG_WATCHDOG_MS + 5,
      lastActivityMs: 0,
      items: [user("fix")],
      permissionPending: true,
    });
    expect(verdict.shouldOffer).toBe(false);
  });
});
