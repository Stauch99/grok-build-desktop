import { describe, expect, it } from "vitest";
import {
  agentIdForPaneDest,
  agentIdOfSession,
  canChangeSelectedAgent,
  hydrateLastAgent,
  keepLiveAgentOnHydrate,
  nextSelectedAgent,
  sessionNewMeta,
  sessionCancelNotification,
  shouldCancelAcpOnNewChat,
  shouldUnbindBeforeNewChat,
  shouldCreateAcpSessionOnNewChat,
  shouldWarmupOnChipSelect,
  planOpenSession,
  selectedAgentAfterOpen,
  stampSessionAgent,
} from "./session-agent";

describe("stampSessionAgent", () => {
  it("defaults missing brand to grok", () => {
    expect(stampSessionAgent({ id: "s1" }).agentId).toBe("grok");
    expect(stampSessionAgent({ id: "s1", agentId: "claude" }).agentId).toBe("claude");
    expect(stampSessionAgent({ id: "s1", agentId: "nope" }).agentId).toBe("grok");
  });
});

describe("nextSelectedAgent", () => {
  it("forbids switching on an open session", () => {
    expect(canChangeSelectedAgent(true)).toBe(false);
    expect(nextSelectedAgent(true, "grok", "kimi")).toBe("grok");
    expect(nextSelectedAgent(false, "grok", "kimi")).toBe("kimi");
  });
});

describe("agentIdOfSession", () => {
  it("returns the session agent when present", () => {
    expect(agentIdOfSession({ agentId: "kimi" })).toBe("kimi");
  });

  it("defaults to grok when agentId is missing", () => {
    expect(agentIdOfSession({})).toBe("grok");
    expect(agentIdOfSession({ agentId: null })).toBe("grok");
  });
});

describe("selectedAgentAfterOpen", () => {
  it("follows the opened session agent, not the current chip", () => {
    expect(selectedAgentAfterOpen("claude", "grok")).toBe("claude");
  });
});

describe("planOpenSession", () => {
  it("syncs the chip even when the pane is already bound", () => {
    expect(
      planOpenSession({ session: { agentId: "codex" }, alreadyBound: true, currentChip: "grok" }),
    ).toEqual({ selectedAfterOpen: "codex", resume: false });
  });

  it("resumes and follows kimi on first open", () => {
    expect(
      planOpenSession({ session: { agentId: "kimi" }, alreadyBound: false, currentChip: "grok" }),
    ).toEqual({ selectedAfterOpen: "kimi", resume: true });
  });
});

describe("agentIdForPaneDest", () => {
  it("targets the extra pane agent while the chip is grok", () => {
    expect(
      agentIdForPaneDest({
        dest: "p2",
        extraAgent: "kimi",
        mainAgentId: "grok",
        chip: "grok",
        hasOpenMainSession: false,
      }),
    ).toBe("kimi");
  });

  it("targets the bound main agent while the chip is grok", () => {
    expect(
      agentIdForPaneDest({
        dest: "main",
        extraAgent: "claude",
        mainAgentId: "kimi",
        chip: "grok",
        hasOpenMainSession: true,
      }),
    ).toBe("kimi");
  });

  it("uses the chip for a new chat with no open session", () => {
    expect(
      agentIdForPaneDest({
        dest: "main",
        mainAgentId: "kimi",
        chip: "claude",
        hasOpenMainSession: false,
      }),
    ).toBe("claude");
  });
});

describe("shouldUnbindBeforeNewChat", () => {
  it("always clears the bound session so chips unlock if the next CLI fails", () => {
    expect(shouldUnbindBeforeNewChat()).toBe(true);
  });
});

describe("shouldCancelAcpOnNewChat", () => {
  it("cancels the bound ACP prompt so a later chip send is not stuck behind it", () => {
    expect(shouldCancelAcpOnNewChat()).toBe(true);
    expect(sessionCancelNotification("sid-1")).toEqual({
      jsonrpc: "2.0",
      method: "session/cancel",
      params: { sessionId: "sid-1" },
    });
  });
});

describe("shouldCreateAcpSessionOnNewChat", () => {
  it("leaves the composer unbound so chips stay switchable until first send", () => {
    expect(shouldCreateAcpSessionOnNewChat()).toBe(false);
  });
});

describe("shouldWarmupOnChipSelect", () => {
  it("starts the selected CLI when the chip changes and no session is bound", () => {
    expect(shouldWarmupOnChipSelect()).toBe(true);
  });
});

describe("keepLiveAgentOnHydrate", () => {
  it("does not let a stale disk snapshot overwrite a user or session pick", () => {
    expect(keepLiveAgentOnHydrate(true, "grok", "kimi")).toBe("kimi");
    expect(keepLiveAgentOnHydrate(false, "kimi", "grok")).toBe("kimi");
  });
});

describe("hydrateLastAgent", () => {
  it("accepts a persisted kimi id", () => {
    expect(hydrateLastAgent("kimi")).toBe("kimi");
  });

  it("rejects junk and missing values", () => {
    expect(hydrateLastAgent("gemini")).toBe("grok");
    expect(hydrateLastAgent(undefined)).toBe("grok");
    expect(hydrateLastAgent(1)).toBe("grok");
  });
});

describe("sessionNewMeta", () => {
  it("stamps yoloMode only for Grok", () => {
    expect(sessionNewMeta("grok", true)).toEqual({ yoloMode: true });
    expect(sessionNewMeta("grok", false)).toEqual({});
    expect(sessionNewMeta("claude", true)).toEqual({});
    expect(sessionNewMeta("codex", true)).toEqual({});
    expect(sessionNewMeta("kimi", true)).toEqual({});
  });
});
