import { describe, expect, it } from "vitest";
import {
  agentIdOfSession,
  canChangeSelectedAgent,
  nextSelectedAgent,
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
