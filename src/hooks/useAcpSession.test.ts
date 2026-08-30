import { describe, expect, it, vi } from "vitest";
import type { AgentId } from "../lib/agent-id";
import { emptyChat } from "../lib/chat";
import { forgetDreamSession, rememberDreamSession } from "../lib/memory-dream-acp";
import {
  isAgentReady,
  isPromptStopResult,
  openSessionAgent,
  paneAgentForEvent,
  sessionIdFromNewResult,
  sessionUpdateDest,
  shouldClearBusyOnPromptResult,
  shouldIgnoreAcpEvent,
  targetAgentId,
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

describe("resume routes to the session agent", () => {
  it("resume with agentId kimi while chip is grok routes startAgent and sendRaw to kimi", async () => {
    const startAgent = vi.fn(async (_id: AgentId) => {});
    const sendRaw = vi.fn(async (_payload: unknown, _id: AgentId) => {});
    const chip: AgentId = "grok";
    const { agentId, selectedAfterOpen } = openSessionAgent({ agentId: "kimi" }, chip);

    expect(selectedAfterOpen).toBe("kimi");
    const ensureId = targetAgentId(agentId, chip);
    const rpcId = targetAgentId(agentId, chip);
    await startAgent(ensureId);
    await sendRaw({ jsonrpc: "2.0", method: "session/resume" }, rpcId);

    expect(startAgent).toHaveBeenCalledWith("kimi");
    expect(sendRaw.mock.calls[0]?.[1]).toBe("kimi");
    expect(sendRaw.mock.calls[0]?.[1]).not.toBe(chip);
  });

  it("create and empty composer keep the chip when no session agent is requested", () => {
    expect(targetAgentId(undefined, "grok")).toBe("grok");
    expect(targetAgentId(undefined, "kimi")).toBe("kimi");
  });
});

describe("per-agent ready", () => {
  it("does not skip kimi boot just because grok is already ready", () => {
    const ready: Partial<Record<AgentId, boolean>> = { grok: true };
    expect(isAgentReady(ready, "grok")).toBe(true);
    expect(isAgentReady(ready, "kimi")).toBe(false);
  });
});

describe("ACP event drop by pane agent", () => {
  it("drops an event whose agent does not match the pane", () => {
    expect(shouldIgnoreAcpEvent("grok", "kimi")).toBe(true);
    expect(shouldIgnoreAcpEvent("kimi", "kimi")).toBe(false);
    expect(shouldIgnoreAcpEvent("grok", undefined)).toBe(false);
  });

  it("uses the split pane agent when dest is split", () => {
    expect(paneAgentForEvent("split", "grok", "claude")).toBe("claude");
    expect(paneAgentForEvent("main", "grok", "claude")).toBe("grok");
  });
});
