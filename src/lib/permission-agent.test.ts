import { describe, expect, it } from "vitest";
import { permissionReplyAgent } from "./permission-agent";

describe("permissionReplyAgent", () => {
  it("defaults undefined to grok", () => {
    expect(permissionReplyAgent(undefined)).toBe("grok");
  });

  it("returns the agent when set", () => {
    expect(permissionReplyAgent("claude")).toBe("claude");
  });

  it("uses fallback when agentId is null", () => {
    expect(permissionReplyAgent(null, "kimi")).toBe("kimi");
  });
});
