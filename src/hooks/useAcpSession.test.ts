import { describe, expect, it } from "vitest";
import { emptyChat } from "../lib/chat";
import { forgetDreamSession, rememberDreamSession } from "../lib/memory-dream-acp";
import {
  isPromptStopResult,
  sessionIdFromNewResult,
  sessionUpdateDest,
  shouldClearBusyOnPromptResult,
  withEchoedUser,
} from "./useAcpSession";

describe("sessionIdFromNewResult", () => {
  it("reads sessionId from the RPC result", () => {
    expect(sessionIdFromNewResult({ sessionId: "abc" })).toBe("abc");
  });

  it("throws when the agent omitted sessionId", () => {
    expect(() => sessionIdFromNewResult({})).toThrow(/sessionId/);
    expect(() => sessionIdFromNewResult(null)).toThrow(/sessionId/);
  });
});

describe("isPromptStopResult", () => {
  it("detects a stopReason payload", () => {
    expect(isPromptStopResult({ stopReason: "end_turn" })).toBe(true);
    expect(isPromptStopResult({ sessionId: "x" })).toBe(false);
    expect(isPromptStopResult(null)).toBe(false);
  });
});

describe("sessionUpdateDest", () => {
  it("routes a matching split session to split", () => {
    expect(sessionUpdateDest("main", "split", "split")).toBe("split");
  });

  it("drops updates for a different main session", () => {
    expect(sessionUpdateDest("main", "split", "other")).toBe("drop");
  });

  it("keeps updates for the current session or unknown ids", () => {
    expect(sessionUpdateDest("main", "split", "main")).toBe("main");
    expect(sessionUpdateDest(null, null, "x")).toBe("main");
  });

  it("drops updates for a remembered dream sid", () => {
    rememberDreamSession("dream-sid");
    expect(sessionUpdateDest(null, null, "dream-sid")).toBe("drop");
    expect(sessionUpdateDest("live", null, "dream-sid")).toBe("drop");
    forgetDreamSession("dream-sid");
    expect(sessionUpdateDest(null, null, "dream-sid")).toBe("main");
  });
});

describe("shouldClearBusyOnPromptResult", () => {
  it("clears busy only when a live waiter owns the rpc id", () => {
    expect(shouldClearBusyOnPromptResult({ stopReason: "end_turn" }, true)).toBe(true);
    expect(shouldClearBusyOnPromptResult({ stopReason: "end_turn" }, false)).toBe(false);
    expect(shouldClearBusyOnPromptResult({ sessionId: "x" }, true)).toBe(false);
  });
});

describe("withEchoedUser", () => {
  it("appends a local user item without mutating the previous chat", () => {
    const prev = emptyChat();
    const next = withEchoedUser(prev, "hello", "u-local", 42);
    expect(prev.items).toHaveLength(0);
    expect(next.items).toEqual([{ kind: "user", id: "u-local-1", text: "hello", at: 42 }]);
    expect(next.nextId).toBe(prev.nextId + 1);
  });
});
