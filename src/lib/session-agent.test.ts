import { describe, expect, it } from "vitest";
import { canChangeSelectedAgent, nextSelectedAgent, stampSessionAgent } from "./session-agent";

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
