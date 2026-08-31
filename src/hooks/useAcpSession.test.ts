import { describe, expect, it, vi } from "vitest";
import type { AgentId } from "../lib/agent-id";
import { emptyChat } from "../lib/chat";
import { forgetDreamSession, rememberDreamSession } from "../lib/memory-dream-acp";
import { agentIdForPaneDest } from "../lib/session-agent";
import { emptyQueue } from "../lib/prompt-queue";
import {
  agentExitToastText,
  extraPanesAfterAgentExit,
  extraPanesAfterAgentStderr,
  extraPanesHitAgent,
  ignoreAcpHistoryDuringResume,
  isAgentReady,
  isPromptStopResult,
  paneAgentForEvent,
  resumeOnSessionAgent,
  sessionIdFromNewResult,
  sessionUpdateDest,
  shouldClearBusyOnPromptError,
  shouldClearBusyOnPromptResult,
  shouldIgnoreAcpEvent,
  stderrToastText,
  targetAgentId,
  withEchoedUser,
  withPromptFail,
  isAbandonedPromptError,
  abandonPendingForDest,
  type ExtraPaneState,
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
  it("routes a matching extra pane by session id", () => {
    expect(sessionUpdateDest({ main: "main", split: "p2" }, "split")).toBe("p2");
  });

  it("drops updates for a different main session", () => {
    expect(sessionUpdateDest({ main: "main", split: "p2" }, "other")).toBe("drop");
  });

  it("keeps updates for the bound main session", () => {
    expect(sessionUpdateDest({ main: "main" }, "main")).toBe("main");
  });

  it("drops sid-scoped updates when no pane is bound", () => {
    expect(sessionUpdateDest({}, "x")).toBe("drop");
  });

  it("drops updates for a remembered dream sid", () => {
    rememberDreamSession("dream-sid");
    expect(sessionUpdateDest({ main: "main" }, "dream-sid")).toBe("drop");
    expect(sessionUpdateDest({}, "dream-sid")).toBe("drop");
    forgetDreamSession("dream-sid");
    expect(sessionUpdateDest({}, "dream-sid")).toBe("drop");
  });
});

describe("shouldClearBusyOnPromptResult", () => {
  it("clears busy only when a live waiter owns the rpc id", () => {
    expect(shouldClearBusyOnPromptResult({ stopReason: "end_turn" }, true)).toBe(true);
    expect(shouldClearBusyOnPromptResult({ stopReason: "end_turn" }, false)).toBe(false);
    expect(shouldClearBusyOnPromptResult({ sessionId: "x" }, true)).toBe(false);
  });

  it("clears busy on any session/prompt result, even without stopReason", () => {
    expect(shouldClearBusyOnPromptResult({}, true, "session/prompt")).toBe(true);
    expect(shouldClearBusyOnPromptResult({}, true, "session/new")).toBe(false);
  });
});

describe("shouldClearBusyOnPromptError", () => {
  it("clears busy when a live prompt rpc returns an error", () => {
    expect(shouldClearBusyOnPromptError({ message: "Authentication required" }, true)).toBe(true);
    expect(shouldClearBusyOnPromptError({ message: "Authentication required" }, false)).toBe(false);
    expect(shouldClearBusyOnPromptError(undefined, true)).toBe(false);
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

describe("withPromptFail", () => {
  it("appends a failed tool once for the same detail", () => {
    const prev = emptyChat();
    const next = withPromptFail(prev, "Authentication required", 9);
    expect(next.items[0]).toMatchObject({
      kind: "tool",
      title: "请求失败",
      status: "failed",
      detail: "Authentication required",
      at: 9,
    });
    expect(withPromptFail(next, "Authentication required", 10).items).toHaveLength(1);
  });
});

describe("abandonPendingForDest", () => {
  it("rejects only waiters bound to that pane", () => {
    const pending = new Map<number, { reject: (e: Error) => void }>();
    const dest = new Map<number, string>([
      [1, "main"],
      [2, "split"],
    ]);
    const rejected: string[] = [];
    pending.set(1, { reject: (e) => rejected.push(e.message) });
    pending.set(2, { reject: (e) => rejected.push(e.message) });
    abandonPendingForDest(pending, dest, "main");
    expect(rejected).toEqual(["prompt-abandoned"]);
    expect(pending.has(1)).toBe(false);
    expect(pending.has(2)).toBe(true);
    expect(isAbandonedPromptError(new Error("prompt-abandoned"))).toBe(true);
    expect(isAbandonedPromptError(new Error("rpc error"))).toBe(false);
  });
});

describe("ignoreAcpHistoryDuringResume", () => {
  it("ignores live ACP history only when disk already filled the thread", () => {
    expect(ignoreAcpHistoryDuringResume(3)).toBe(true);
    expect(ignoreAcpHistoryDuringResume(0)).toBe(false);
  });
});

describe("resume routes to the session agent", () => {
  it("resume with agentId kimi while chip is grok routes startAgent and sendRaw to kimi", async () => {
    const startAgent = vi.fn(async (_id: AgentId) => {});
    const sendRaw = vi.fn(async (_payload: unknown, _id: AgentId) => {});
    const chip: AgentId = "grok";

    const agentId = await resumeOnSessionAgent({
      session: { id: "sid-kimi", cwd: "/work", agentId: "kimi" },
      chip,
      startAgent,
      sendRaw,
      alreadyReady: (id) => id === "grok",
    });

    expect(agentId).toBe("kimi");
    expect(startAgent).toHaveBeenCalledTimes(1);
    expect(startAgent).toHaveBeenCalledWith("kimi");
    expect(startAgent).not.toHaveBeenCalledWith(chip);
    expect(sendRaw).toHaveBeenCalledTimes(1);
    expect(sendRaw.mock.calls[0]?.[1]).toBe("kimi");
    expect(sendRaw.mock.calls[0]?.[1]).not.toBe(chip);
    const payload = sendRaw.mock.calls[0]?.[0] as { method?: string; params?: { sessionId?: string } };
    expect(payload.method).toBe("session/resume");
    expect(payload.params?.sessionId).toBe("sid-kimi");
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

describe("prompt and cancel target the pane agent, not the chip", () => {
  it("sends extra-pane prompt/cancel to kimi while the chip is grok", () => {
    const target = agentIdForPaneDest({
      dest: "p2",
      extraAgent: "kimi",
      mainAgentId: "grok",
      chip: "grok",
      hasOpenMainSession: true,
    });
    expect(target).toBe("kimi");
    expect(target).not.toBe("grok");
  });

  it("sends main prompt/cancel to the bound kimi session while the chip is grok", () => {
    const target = agentIdForPaneDest({
      dest: "main",
      extraAgent: "claude",
      mainAgentId: "kimi",
      chip: "grok",
      hasOpenMainSession: true,
    });
    expect(target).toBe("kimi");
    expect(target).not.toBe("grok");
  });

  it("uses the chip for a new chat with no session", () => {
    expect(
      agentIdForPaneDest({
        dest: "main",
        mainAgentId: "kimi",
        chip: "codex",
        hasOpenMainSession: false,
      }),
    ).toBe("codex");
  });
});

function extraPane(over: Partial<ExtraPaneState> = {}): ExtraPaneState {
  return {
    sessionId: "sid",
    cwd: "/work",
    chat: emptyChat(),
    draft: "",
    busy: true,
    atBottom: true,
    queue: emptyQueue(),
    agentId: "claude",
    ...over,
  };
}

describe("cross-agent stderr", () => {
  it("labels toast with the emitting CLI and ignores other panes", () => {
    expect(stderrToastText("claude", "Authentication required")).toBe("Claude · Authentication required");
    expect(shouldIgnoreAcpEvent("grok", "claude")).toBe(true);
    expect(shouldIgnoreAcpEvent("claude", "claude")).toBe(false);
  });

  it("clears only the claude extra pane when claude stderr fires while grok is on main", () => {
    const prev = {
      split: extraPane({ agentId: "claude", busy: true }),
      p2: extraPane({ agentId: "grok", busy: true }),
    };
    const next = extraPanesAfterAgentStderr(prev, "claude", "Authentication required", 9);
    expect(next.split?.busy).toBe(false);
    expect(next.split?.chat.items[0]).toMatchObject({ status: "failed", detail: "Authentication required" });
    expect(next.p2?.busy).toBe(true);
    expect(next.p2?.chat.items).toHaveLength(0);
  });
});

describe("cross-agent process exit", () => {
  it("clears the claude extra pane and leaves a busy grok extra running", () => {
    const prev = {
      split: extraPane({ agentId: "claude", busy: true }),
      p2: extraPane({ agentId: "grok", busy: true }),
    };
    const next = extraPanesAfterAgentExit(prev, "claude");
    expect(next.split?.busy).toBe(false);
    expect(next.p2?.busy).toBe(true);
    expect(extraPanesHitAgent(prev, "claude")).toBe(true);
    expect(extraPanesHitAgent(prev, "kimi")).toBe(false);
    expect(agentExitToastText("claude")).toBe("Claude 已退出");
  });

  it("clears grok extras without touching a busy claude pane", () => {
    const prev = {
      split: extraPane({ agentId: "claude", busy: true }),
      p2: extraPane({ agentId: "grok", busy: true }),
    };
    const next = extraPanesAfterAgentExit(prev, "grok");
    expect(next.split?.busy).toBe(true);
    expect(next.p2?.busy).toBe(false);
  });
});
