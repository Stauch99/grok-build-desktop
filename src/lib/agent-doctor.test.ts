import { describe, expect, it } from "vitest";
import {
  agentSendBlockReason,
  blockedAgentToast,
  defaultAgentHome,
  defaultInstallHint,
  defaultLoginHint,
  doctorActionHint,
  emptyDoctor,
} from "./agent-doctor";

describe("defaultAgentHome", () => {
  it("maps each CLI to its native home", () => {
    expect(defaultAgentHome("/Users/me/", "grok")).toBe("/Users/me/.grok");
    expect(defaultAgentHome("/Users/me", "kimi")).toBe("/Users/me/.kimi-code");
    expect(defaultAgentHome("/Users/me", "claude")).toBe("/Users/me/.claude");
    expect(defaultAgentHome("/Users/me", "codex")).toBe("/Users/me/.codex");
  });
});

describe("emptyDoctor", () => {
  it("starts unauthenticated and reports no binary", () => {
    expect(emptyDoctor("kimi", "/Users/me")).toEqual({
      agentId: "kimi",
      binary: null,
      version: null,
      home: "/Users/me/.kimi-code",
      authPresent: false,
      authKind: "none",
      loginHint: ["kimi login"],
    });
    expect(defaultLoginHint("grok")).toEqual(["grok auth login"]);
    expect(defaultLoginHint("claude")).toEqual(["claude auth login"]);
    expect(defaultLoginHint("codex")).toEqual(["codex login"]);
  });
});

describe("agentSendBlockReason", () => {
  it("says 未安装 when the binary is missing", () => {
    expect(agentSendBlockReason("kimi", [emptyDoctor("kimi", "/Users/me")])).toBe("Kimi 未安装");
  });

  it("says 未登录 when the CLI is installed but has no auth", () => {
    expect(
      agentSendBlockReason("kimi", [{ agentId: "kimi", authPresent: false, binary: "/usr/bin/kimi" }]),
    ).toBe("Kimi 未登录");
  });

  it("does not block a logged-in CLI or an unknown doctor", () => {
    expect(
      agentSendBlockReason("kimi", [{ agentId: "kimi", authPresent: true, binary: "/usr/bin/kimi" }]),
    ).toBeNull();
    expect(agentSendBlockReason("kimi", [])).toBeNull();
  });

  it("appends the copyable next step to the chip toast", () => {
    expect(blockedAgentToast("kimi", [emptyDoctor("kimi", "/Users/me")])).toBe(
      `Kimi 未安装 · ${defaultInstallHint("kimi")[0]}`,
    );
    expect(
      blockedAgentToast("claude", [
        { agentId: "claude", authPresent: false, binary: "/usr/bin/claude", loginHint: ["claude auth login"] },
      ]),
    ).toBe("Claude 未登录 · claude auth login");
    expect(
      blockedAgentToast("grok", [{ agentId: "grok", authPresent: true, binary: "/usr/bin/grok", loginHint: [] }]),
    ).toBeNull();
  });
});

describe("doctorActionHint", () => {
  it("offers an install command when the binary is missing", () => {
    expect(doctorActionHint(emptyDoctor("claude", "/Users/me"))).toEqual(defaultInstallHint("claude"));
  });

  it("offers the login command when installed but logged out", () => {
    expect(
      doctorActionHint({
        agentId: "codex",
        binary: "/opt/homebrew/bin/codex",
        authPresent: false,
        loginHint: ["codex login"],
      }),
    ).toEqual(["codex login"]);
  });

  it("is empty when the CLI is ready", () => {
    expect(
      doctorActionHint({
        agentId: "grok",
        binary: "/Users/me/.grok/bin/grok",
        authPresent: true,
        loginHint: ["grok auth login"],
      }),
    ).toEqual([]);
  });
});
