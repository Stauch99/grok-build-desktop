import { describe, expect, it, vi } from "vitest";

const startAgent = vi.fn(async () => {});
const stopAgent = vi.fn(async () => {});
const sendRaw = vi.fn(async () => ({}));
vi.mock("../api", () => ({
  startAgent: (...a: unknown[]) => startAgent(...a),
  stopAgent: (...a: unknown[]) => stopAgent(...a),
  sendRaw: (...a: unknown[]) => sendRaw(...a),
}));

import { billingKindFromDoctors, doctorOverviewLine, portFor } from "./agent-port";

describe("agent-port", () => {
  it("binds start/stop/send to one AgentId", async () => {
    const p = portFor("claude");
    expect(p.id).toBe("claude");
    await p.start();
    await p.stop();
    await p.send({ method: "initialize" });
    expect(startAgent).toHaveBeenCalledWith("claude");
    expect(stopAgent).toHaveBeenCalledWith("claude");
    expect(sendRaw).toHaveBeenCalledWith({ method: "initialize" }, "claude");
  });

  it("picks billing kind and overview copy", () => {
    const docs = [
      { agentId: "grok" as const, authKind: "subscription" as const },
      { agentId: "claude" as const, authKind: "api" as const },
    ];
    expect(billingKindFromDoctors(docs, "grok")).toBe("subscription");
    expect(billingKindFromDoctors(docs, "claude")).toBe("api");
    expect(billingKindFromDoctors(docs, "kimi")).toBe("none");
    expect(doctorOverviewLine(docs[0]!)).toBe("grok · 已登录");
    expect(doctorOverviewLine(docs[1]!)).toBe("claude · API");
    expect(doctorOverviewLine({ agentId: "kimi", authKind: "none" })).toBe("kimi · 未登录");
  });
});
