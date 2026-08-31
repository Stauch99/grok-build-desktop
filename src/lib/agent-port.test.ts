import { describe, expect, it, vi } from "vitest";

const startAgent = vi.fn(async (_id?: string) => {});
const stopAgent = vi.fn(async (_id?: string) => {});
const sendRaw = vi.fn(async (_payload?: unknown, _id?: string) => ({}));
vi.mock("../api", () => ({
  startAgent: (id: string) => startAgent(id),
  stopAgent: (id: string) => stopAgent(id),
  sendRaw: (payload: unknown, id?: string) => sendRaw(payload, id),
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
      { agentId: "grok" as const, authKind: "subscription" as const, binary: "/usr/bin/grok", version: "1.0.13" },
      { agentId: "claude" as const, authKind: "api" as const, binary: "/usr/bin/claude", version: null },
    ];
    expect(billingKindFromDoctors(docs, "grok")).toBe("subscription");
    expect(billingKindFromDoctors(docs, "claude")).toBe("api");
    expect(billingKindFromDoctors(docs, "kimi")).toBe("none");
    expect(doctorOverviewLine(docs[0]!)).toBe("grok · 已登录 · 1.0.13 · /usr/bin/grok");
    expect(doctorOverviewLine(docs[1]!)).toBe("claude · API · /usr/bin/claude");
    expect(doctorOverviewLine({ agentId: "kimi", authKind: "none", binary: null, version: null })).toBe(
      "kimi · 未安装",
    );
    expect(
      doctorOverviewLine({ agentId: "kimi", authKind: "none", binary: "/usr/bin/kimi", version: null }),
    ).toBe("kimi · 未登录 · /usr/bin/kimi");
  });
});
