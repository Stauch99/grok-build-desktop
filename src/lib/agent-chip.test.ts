import { describe, expect, it } from "vitest";
import { AGENT_IDS } from "./agent-id";
import { agentChipClassName, agentChipDisabled, agentChipLabel } from "./agent-chip";

describe("agentChipDisabled", () => {
  it("locks the chip when a session is open", () => {
    expect(agentChipDisabled(true)).toBe(true);
    expect(agentChipDisabled(false)).toBe(false);
  });
});

describe("agentChipLabel", () => {
  it("title-cases every AgentId", () => {
    expect(agentChipLabel("grok")).toBe("Grok");
    expect(agentChipLabel("kimi")).toBe("Kimi");
    expect(agentChipLabel("claude")).toBe("Claude");
    expect(agentChipLabel("codex")).toBe("Codex");
  });

  it("covers all AGENT_IDS", () => {
    expect(AGENT_IDS.map(agentChipLabel)).toEqual(["Grok", "Kimi", "Claude", "Codex"]);
  });
});

describe("agentChipClassName", () => {
  it("marks only the selected brand active", () => {
    expect(agentChipClassName("kimi", "kimi")).toBe("agent-chip agent-chip-kimi active");
    expect(agentChipClassName("grok", "kimi")).toBe("agent-chip agent-chip-grok");
  });
});
