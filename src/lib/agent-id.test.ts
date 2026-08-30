import { describe, expect, it } from "vitest";
import {
  AGENT_IDS,
  isAgentId,
  parseSessionRefKey,
  sessionRefKey,
} from "./agent-id";

describe("AgentId", () => {
  it("accepts the four closed ids", () => {
    expect([...AGENT_IDS]).toEqual(["grok", "kimi", "claude", "codex"]);
    expect(isAgentId("grok")).toBe(true);
    expect(isAgentId("kimi")).toBe(true);
    expect(isAgentId("claude")).toBe(true);
    expect(isAgentId("codex")).toBe(true);
    expect(isAgentId("gemini")).toBe(false);
    expect(isAgentId("Grok")).toBe(false);
  });
});

describe("SessionRef", () => {
  it("round-trips agentId/sessionId", () => {
    expect(sessionRefKey({ agentId: "claude", sessionId: "s1" })).toBe("claude/s1");
    expect(parseSessionRefKey("claude/s1")).toEqual({ agentId: "claude", sessionId: "s1" });
  });

  it("keeps session ids that contain slashes after the first separator", () => {
    expect(parseSessionRefKey("kimi/wd_a/sess")).toEqual({
      agentId: "kimi",
      sessionId: "wd_a/sess",
    });
  });

  it("treats legacy bare grok ids as grok/<id>", () => {
    expect(parseSessionRefKey("abc-123")).toEqual({ agentId: "grok", sessionId: "abc-123" });
  });

  it("rejects empty and unknown agent prefixes", () => {
    expect(parseSessionRefKey("")).toBeNull();
    expect(parseSessionRefKey("gemini/x")).toBeNull();
    expect(parseSessionRefKey("grok/")).toBeNull();
  });
});
