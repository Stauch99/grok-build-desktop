import { describe, expect, it } from "vitest";
import { DEFAULT_THRESHOLD_SESSIONS } from "./memory-gates";
import { canSaveDreamAgent, parseMemorySettings } from "./memory-settings";

describe("parseMemorySettings", () => {
  it("defaults to inject on, dreaming on, grok, and default threshold", () => {
    expect(parseMemorySettings(undefined)).toEqual({
      injectUserMemory: true,
      dreamingEnabled: true,
      dreamAgentId: "grok",
      dreamThresholdSessions: DEFAULT_THRESHOLD_SESSIONS,
      memoryMcpEnabled: true,
      memoryDisplayName: "",
    });
  });

  it("keeps a logged-in claude runner and custom threshold", () => {
    expect(
      parseMemorySettings({
        injectUserMemory: false,
        dreamingEnabled: false,
        dreamAgentId: "claude",
        dreamThresholdSessions: 12,
      }),
      ).toEqual({
        injectUserMemory: false,
        dreamingEnabled: false,
        dreamAgentId: "claude",
        dreamThresholdSessions: 12,
        memoryMcpEnabled: true,
        memoryDisplayName: "",
      });
  });

  it("clamps out-of-range thresholds", () => {
    expect(parseMemorySettings({ dreamThresholdSessions: 1 }).dreamThresholdSessions).toBe(4);
    expect(parseMemorySettings({ dreamThresholdSessions: 99 }).dreamThresholdSessions).toBe(20);
    expect(parseMemorySettings({ dreamThresholdSessions: "bad" }).dreamThresholdSessions).toBe(
      DEFAULT_THRESHOLD_SESSIONS,
    );
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
