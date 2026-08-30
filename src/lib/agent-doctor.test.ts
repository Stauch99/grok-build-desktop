import { describe, expect, it } from "vitest";
import { agentSendBlockReason, defaultAgentHome, defaultLoginHint, emptyDoctor } from "./agent-doctor";

describe("defaultAgentHome", () => {
  it("maps each CLI to its native home", () => {
    expect(defaultAgentHome("/Users/me/", "grok")).toBe("/Users/me/.grok");
    expect(defaultAgentHome("/Users/me", "kimi")).toBe("/Users/me/.kimi-code");
    expect(defaultAgentHome("/Users/me", "claude")).toBe("/Users/me/.claude");
    expect(defaultAgentHome("/Users/me", "codex")).toBe("/Users/me/.codex");
  });
});

describe("emptyDoctor", () => {
  it("starts unauthenticated", () => {
    expect(emptyDoctor("kimi", "/Users/me")).toEqual({
      agentId: "kimi",
      binary: null,
      version: null,
      home: "/Users/me/.kimi-code",
      authPresent: false,
      authKind: "none",
      acpSpawnOk: false,
      loginHint: ["login"],
    });
    expect(defaultLoginHint("grok")).toEqual(["login"]);
  });
});

describe("agentSendBlockReason", () => {
  it("blocks send when that CLI has no auth", () => {
    expect(agentSendBlockReason("kimi", [emptyDoctor("kimi", "/Users/me")])).toBe("Kimi 未登录");
  });

  it("does not block a logged-in CLI or an unknown doctor", () => {
    expect(agentSendBlockReason("kimi", [{ agentId: "kimi", authPresent: true }])).toBeNull();
    expect(agentSendBlockReason("kimi", [])).toBeNull();
  });
});
