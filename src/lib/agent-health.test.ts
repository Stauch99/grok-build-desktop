import { describe, expect, it } from "vitest";
import { agentHealth, GROK_LOGIN_CMD } from "./agent-health";

describe("agentHealth", () => {
  it("is ok while the stdio agent is ready", () => {
    expect(agentHealth({ ready: true, connecting: false, sawExit: false })).toBe("ok");
  });

  it("is connecting during startup", () => {
    expect(agentHealth({ ready: false, connecting: true, sawExit: false })).toBe("connecting");
  });

  it("is disconnected after an unexpected exit", () => {
    expect(agentHealth({ ready: false, connecting: false, sawExit: true })).toBe("disconnected");
  });

  it("stays idle before the first connect", () => {
    expect(agentHealth({ ready: false, connecting: false, sawExit: false })).toBe("idle");
  });
});

describe("GROK_LOGIN_CMD", () => {
  it("is the CLI login command", () => {
    expect(GROK_LOGIN_CMD).toBe("grok login");
  });
});
