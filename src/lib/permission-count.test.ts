import { describe, expect, it } from "vitest";
import { pendingExtraByPane } from "./permission-count";
import type { QueuedPermission } from "./permission-queue";

const CTX = {
  mainSessionId: "s1",
  runningMainSessionId: "s1",
  splitSessionId: "s2",
  mainBusy: true,
  splitBusy: false,
};

function req(rpcId: number | string, over: Partial<QueuedPermission> = {}): QueuedPermission {
  return {
    rpcId,
    title: "bash ls",
    toolKind: "execute",
    options: [],
    sessionId: "s1",
    receivedAt: 1,
    timedOut: false,
    agentId: "grok",
    ...over,
  };
}

describe("pendingExtraByPane", () => {
  it("counts requests waiting behind the visible card", () => {
    const queue = [req(1), req(2), req(3)];
    expect(pendingExtraByPane(queue, CTX).main).toBe(2);
  });

  it("routes by session id across panes", () => {
    const queue = [req(1), req(2), req(3, { sessionId: "s2" })];
    const out = pendingExtraByPane(queue, CTX);
    expect(out.main).toBe(1);
    expect(out.split).toBe(0);
  });

  it("ignores timed-out requests and unrouted ones", () => {
    const queue = [req(1), req(2, { timedOut: true }), req(3, { sessionId: "gone" })];
    const out = pendingExtraByPane(queue, CTX);
    // "gone" session routes to main anyway (fallback), timed-out is skipped
    expect(out.main).toBe(1);
    expect(pendingExtraByPane([], CTX)).toEqual({});
  });
});
