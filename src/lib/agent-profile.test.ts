import { describe, expect, it } from "vitest";
import { AGENT_IDS } from "./agent-id";
import { defaultProfile, defaultProfiles } from "./agent-profile";

describe("defaultProfile", () => {
  it("uses the locked ACP argv per AgentId", () => {
    expect(defaultProfile("grok")).toEqual({
      id: "grok",
      label: "Grok",
      command: "grok",
      args: ["agent", "stdio"],
      loginArgs: ["login"],
    });
    expect(defaultProfile("kimi")).toEqual({
      id: "kimi",
      label: "Kimi",
      command: "kimi",
      args: ["acp"],
      loginArgs: ["login"],
    });
    expect(defaultProfile("claude")).toEqual({
      id: "claude",
      label: "Claude",
      command: "npx",
      args: ["-y", "@agentclientprotocol/claude-agent-acp"],
      loginArgs: ["login"],
    });
    expect(defaultProfile("codex")).toEqual({
      id: "codex",
      label: "Codex",
      command: "npx",
      args: ["-y", "@agentclientprotocol/codex-acp"],
      loginArgs: ["login"],
    });
  });
});

describe("defaultProfiles", () => {
  it("covers every AgentId exactly once", () => {
    const all = defaultProfiles();
    expect(Object.keys(all).sort()).toEqual([...AGENT_IDS].sort());
    for (const id of AGENT_IDS) {
      expect(all[id]).toEqual(defaultProfile(id));
    }
  });
});
