import { describe, expect, it, vi } from "vitest";
import { readFileSync } from "node:fs";
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
  shouldDropUpdateAfterAgentExit,
  ignoreAcpHistoryDuringResume,
  isAgentReady,
  shouldHonorAgentExit,
  isPromptStopResult,
  paneAgentForEvent,
  resumeOnSessionAgent,
  sessionIdFromNewResult,
  sessionUpdateDest,
  shouldClearBusyOnPromptError,
  shouldClearBusyAfterPromptCatch,
  shouldKeepBusyForNewerPrompt,
  shouldClearBusyOnPromptResult,
  shouldIgnoreAcpEvent,
  stderrToastText,
  targetAgentId,
  withEchoedUser,
  echoUserOnce,
  withPromptFail,
  isAbandonedPromptError,
  abandonPendingForDest,
  destHasPendingPrompt,
  shouldIdleAfterPromptRpc,
  shouldSettlePaneBusy,
  cancelTargetSessionId,
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

describe("shouldClearBusyAfterPromptCatch", () => {
  it("keeps busy when the previous prompt was abandoned for a new send", () => {
    expect(shouldClearBusyAfterPromptCatch(new Error("prompt-abandoned"))).toBe(false);
    expect(shouldClearBusyAfterPromptCatch(new Error("rpc error"))).toBe(true);
  });
});

describe("shouldKeepBusyForNewerPrompt", () => {
  it("keeps busy when cancel of an older turn races a newer send", () => {
    expect(shouldKeepBusyForNewerPrompt(1, 1)).toBe(false);
    expect(shouldKeepBusyForNewerPrompt(1, 2)).toBe(true);
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

describe("echoUserOnce", () => {
  it("does not duplicate the same user bubble when the queue later flushes", () => {
    const echoed = withEchoedUser(emptyChat(), "咋停了", "u-queue", 1);
    expect(echoUserOnce(echoed, "咋停了", "u-local", 2)).toBe(echoed);
  });

  it("appends a second prompt as its own bubble", () => {
    const first = withEchoedUser(emptyChat(), "咋停了", "u-queue", 1);
    const next = echoUserOnce(first, "进度如何呀？卡住了。", "u-queue", 2);
    expect(next.items.map((it) => (it.kind === "user" ? it.text : ""))).toEqual([
      "咋停了",
      "进度如何呀？卡住了。",
    ]);
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

describe("shouldIdleAfterPromptRpc", () => {
  it("keeps the pane busy when a steer/second prompt waiter is still live", () => {
    expect(shouldIdleAfterPromptRpc({ clearOnResult: true, otherPromptWaiters: true })).toBe(false);
    expect(shouldIdleAfterPromptRpc({ clearOnResult: true, otherPromptWaiters: false })).toBe(true);
    expect(shouldIdleAfterPromptRpc({ clearOnResult: false, otherPromptWaiters: false })).toBe(false);
  });
});

describe("shouldSettlePaneBusy", () => {
  it("does not idle on the settle timer while a prompt waiter is still live", () => {
    expect(shouldSettlePaneBusy({ settled: true, pendingPrompt: true })).toBe(false);
    expect(shouldSettlePaneBusy({ settled: true, pendingPrompt: false })).toBe(true);
    expect(shouldSettlePaneBusy({ settled: false, pendingPrompt: false })).toBe(false);
  });
});

describe("cancelTargetSessionId", () => {
  it("falls back to the bound session when runningSessionId was cleared", () => {
    expect(cancelTargetSessionId("run", "bound")).toBe("run");
    expect(cancelTargetSessionId(null, "bound")).toBe("bound");
    expect(cancelTargetSessionId(null, null)).toBeNull();
  });
});

describe("destHasPendingPrompt", () => {
  it("is true only for a live session/prompt waiter on that pane", () => {
    const pending = new Map<number, { method?: string }>([
      [1, { method: "session/prompt" }],
      [2, { method: "session/prompt" }],
      [3, { method: "session/new" }],
    ]);
    const dest = new Map<number, string>([
      [1, "main"],
      [2, "split"],
      [3, "main"],
    ]);
    expect(destHasPendingPrompt(pending, dest, "main")).toBe(true);
    expect(destHasPendingPrompt(pending, dest, "split")).toBe(true);
    expect(destHasPendingPrompt(pending, dest, "other")).toBe(false);
    pending.delete(1);
    expect(destHasPendingPrompt(pending, dest, "main")).toBe(false);
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

describe("shouldHonorAgentExit", () => {
  it("ignores every exit while a new spawn is still in start_agent", () => {
    expect(shouldHonorAgentExit({ spawning: true, liveGeneration: 1, eventGeneration: 1 })).toBe(false);
    expect(shouldHonorAgentExit({ spawning: true, liveGeneration: 0, eventGeneration: 2 })).toBe(false);
  });

  it("ignores a replaced generation after the new boot owns the slot", () => {
    expect(shouldHonorAgentExit({ spawning: false, liveGeneration: 3, eventGeneration: 2 })).toBe(false);
  });

  it("honors the live generation once spawn has returned", () => {
    expect(shouldHonorAgentExit({ spawning: false, liveGeneration: 3, eventGeneration: 3 })).toBe(true);
    expect(shouldHonorAgentExit({ spawning: false, liveGeneration: 0, eventGeneration: 0 })).toBe(true);
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
    const next = extraPanesAfterAgentExit(prev, "claude", { detail: "Claude 已退出", at: 9 });
    expect(next.split?.busy).toBe(false);
    expect(next.split?.chat.items.at(-1)).toMatchObject({ status: "failed", detail: "Claude 已退出" });
    expect(next.p2?.busy).toBe(true);
    expect(next.p2?.chat.items).toHaveLength(0);
    expect(extraPanesHitAgent(prev, "claude")).toBe(true);
    expect(extraPanesHitAgent(prev, "kimi")).toBe(false);
    expect(agentExitToastText("claude")).toBe("Claude 已退出");
  });

  it("clears grok extras without touching a busy claude pane", () => {
    const prev = {
      split: extraPane({ agentId: "claude", busy: true }),
      p2: extraPane({ agentId: "grok", busy: true }),
    };
    const next = extraPanesAfterAgentExit(prev, "grok", { detail: "Grok 已退出", at: 9 });
    expect(next.split?.busy).toBe(true);
    expect(next.p2?.busy).toBe(false);
  });

  it("cancels in-progress tools on the crashed pane", () => {
    const prev = {
      split: extraPane({
        agentId: "claude",
        busy: true,
        chat: {
          ...emptyChat(),
          items: [{ kind: "tool", id: "t1", title: "bash", status: "in_progress", at: 1 }],
          nextId: 2,
        },
      }),
    };
    const next = extraPanesAfterAgentExit(prev, "claude", { detail: "Claude 已退出", at: 9 });
    expect(next.split?.chat.items[0]).toMatchObject({ id: "t1", status: "cancelled" });
    expect(next.split?.chat.items.at(-1)).toMatchObject({ status: "failed" });
  });

  it("heals extra panes that went idle with tools still open", () => {
    const prev = {
      split: extraPane({
        agentId: "claude",
        busy: false,
        chat: {
          ...emptyChat(),
          items: [{ kind: "tool", id: "t1", title: "bash", status: "in_progress", at: 1 }],
          nextId: 2,
        },
      }),
    };
    const next = extraPanesAfterAgentExit(prev, "claude", { detail: "Claude 已退出", at: 9 });
    expect(next.split?.chat.items[0]).toMatchObject({ status: "cancelled" });
  });

  it("crashes the live extra-pane chat when React state has not caught up", () => {
    const live = {
      ...emptyChat(),
      items: [{ kind: "tool" as const, id: "t1", title: "bash", status: "in_progress" as const, at: 1 }],
      nextId: 2,
    };
    const prev = {
      split: extraPane({ agentId: "claude", busy: false, chat: emptyChat() }),
    };
    const next = extraPanesAfterAgentExit(prev, "claude", { detail: "Claude 已退出", at: 9 }, { split: live });
    expect(next.split?.chat.items[0]).toMatchObject({ id: "t1", status: "cancelled" });
    expect(next.split?.busy).toBe(false);
  });
});

describe("shouldDropUpdateAfterAgentExit", () => {
  it("drops leftover updates after the CLI is marked not ready, not before", () => {
    expect(shouldDropUpdateAfterAgentExit({}, "grok")).toBe(false);
    expect(shouldDropUpdateAfterAgentExit({ grok: true }, "grok")).toBe(false);
    expect(shouldDropUpdateAfterAgentExit({ grok: false }, "grok")).toBe(true);
    expect(shouldDropUpdateAfterAgentExit({ grok: false }, "claude")).toBe(false);
    expect(shouldDropUpdateAfterAgentExit({ grok: false }, undefined)).toBe(false);
  });
});

describe("resumeSession tree chrome", () => {
  it("does not expand parent rows when opening a session", () => {
    const src = readFileSync(new URL("./useAcpSession.ts", import.meta.url), "utf8");
    expect(src).not.toMatch(/setExpandedIds\(\(prev\) => new Set\(prev\)\.add\(pid\)\)/);
  });
});

describe("main-pane settle while another session is on screen", () => {
  it("does not idle the running turn from the displayed transcript", () => {
    const src = readFileSync(new URL("./useAcpSession.ts", import.meta.url), "utf8");
    expect(src).toMatch(/shouldWatchDisplayedSession\(\{[\s\S]*boundSessionId: sessionIdRef\.current/);
    expect(src).toMatch(/if \(watchingMain\) \{/);
  });
});

describe("createAcpSession sidebar", () => {
  it("drops leftover usage when the bound session id changes", () => {
    const src = readFileSync(new URL("./useAcpSession.ts", import.meta.url), "utf8");
    expect(src).toMatch(/setChat\(\(chat\) => chatAfterBoundSessionChange\(chat, prev, id\)\)/);
  });

  it("announces the new session instead of waiting for a disk scan", () => {
    const src = readFileSync(new URL("./useAcpSession.ts", import.meta.url), "utf8");
    expect(src).toMatch(/d\.onSessionCreated\(\s*createdSessionSummary\(/);
  });

  it("stamps first-user text and does not wait 500ms for a vendor title", () => {
    const src = readFileSync(new URL("./useAcpSession.ts", import.meta.url), "utf8");
    expect(src).toMatch(/createdSessionSummary\(\{[\s\S]*?title:/);
    expect(src).not.toMatch(/onSessionsNeedRefresh\(\), 500/);
  });

  it("passes the composer model into session/new and the sidebar placeholder", () => {
    const src = readFileSync(new URL("./useAcpSession.ts", import.meta.url), "utf8");
    expect(src).toMatch(/sessionNewMeta\(agentId, depsRef\.current\.mode === "yolo", depsRef\.current\.model\)/);
    expect(src).toMatch(/model: d\.model/);
  });
});

describe("queuePrompt echo", () => {
  it("inserts a user bubble when a prompt is queued during a live turn", () => {
    const src = readFileSync(new URL("./useAcpSession.ts", import.meta.url), "utf8");
    expect(src).toMatch(/function queuePrompt[\s\S]*echoUserOnce\(prev, text, "u-queue"/);
  });
});

describe("ACP image prompt", () => {
  it("remembers initialize promptCapabilities and sends prepared blocks", () => {
    const src = readFileSync(new URL("./useAcpSession.ts", import.meta.url), "utf8");
    expect(src).toMatch(/promptCapabilitiesFromInitialize\(initializeResult\)/);
    expect(src).toMatch(/prepareAcpPrompt\(/);
    expect(src).toMatch(/prompt: blocks/);
    expect(src).not.toMatch(/prompt: \[\{ type: "text", text: acpText \}\]/);
  });

  it("echoes the composer @path text, not the rewritten workspace paste", () => {
    const src = readFileSync(new URL("./useAcpSession.ts", import.meta.url), "utf8");
    expect(src).toMatch(/echoUserOnce\(prev\.chat, text, "u-local"/);
    expect(src).toMatch(/echoUserOnce\(prev, text, "u-local"/);
  });
});
