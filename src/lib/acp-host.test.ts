import { describe, expect, it } from "vitest";
import { acpMessageFromEvent, resolveStartAgentId, stderrFromAcpEvent, shouldDropAcpEvent } from "./acp-host";

describe("resolveStartAgentId", () => {
  it("defaults blank to grok and rejects unknown", () => {
    expect(resolveStartAgentId()).toBe("grok");
    expect(resolveStartAgentId(null)).toBe("grok");
    expect(resolveStartAgentId("")).toBe("grok");
    expect(resolveStartAgentId("codex")).toBe("codex");
    expect(() => resolveStartAgentId("gemini")).toThrow(/未知 agent/);
  });
});

describe("acpMessageFromEvent", () => {
  it("unwraps tagged envelopes and legacy bodies", () => {
    const payload = { jsonrpc: "2.0", method: "session/update" };
    expect(acpMessageFromEvent({ agentId: "claude", generation: 1, payload })).toEqual({
      agentId: "claude",
      payload,
    });
    expect(acpMessageFromEvent(payload)).toEqual({ agentId: "grok", payload });
  });
});

describe("stderrFromAcpEvent", () => {
  it("keeps a tagged CLI on stderr and defaults legacy strings to grok", () => {
    expect(stderrFromAcpEvent({ agentId: "claude", generation: 2, payload: "Authentication required" })).toEqual({
      line: "Authentication required",
      agentId: "claude",
    });
    expect(stderrFromAcpEvent("Prompt for session x failed")).toEqual({
      line: "Prompt for session x failed",
      agentId: "grok",
    });
  });
});

describe("shouldDropAcpEvent", () => {
  it("drops other agents", () => {
    expect(shouldDropAcpEvent("grok", "grok")).toBe(false);
    expect(shouldDropAcpEvent("grok", "kimi")).toBe(true);
  });
});
