import { describe, expect, it } from "vitest";
import {
  agentIdForPaneDest,
  agentIdOfSession,
  canChangeSelectedAgent,
  hydrateLastAgent,
  keepLiveAgentOnHydrate,
  nextSelectedAgent,
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
