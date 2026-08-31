import { describe, expect, it } from "vitest";
import { canSaveDreamAgent, parseMemorySettings } from "./memory-settings";

describe("parseMemorySettings", () => {
  it("defaults to inject on, dreaming on, grok", () => {
    expect(parseMemorySettings(undefined)).toEqual({
      injectUserMemory: true,
      dreamingEnabled: true,
      dreamAgentId: "grok",
    });
  });

  it("keeps a logged-in claude runner", () => {
    expect(parseMemorySettings({ injectUserMemory: false, dreamingEnabled: false, dreamAgentId: "claude" })).toEqual({
      injectUserMemory: false,
      dreamingEnabled: false,
      dreamAgentId: "claude",
    });
  });

  it("rejects an unknown agent id", () => {
    expect(parseMemorySettings({ dreamAgentId: "other" }).dreamAgentId).toBe("grok");
  });
});

describe("canSaveDreamAgent", () => {
  it("allows only logged-in agents", () => {
    expect(canSaveDreamAgent("kimi", ["kimi", "grok"])).toBe(true);
    expect(canSaveDreamAgent("claude", ["grok"])).toBe(false);
    expect(canSaveDreamAgent("nope", ["grok"])).toBe(false);
  });
});
