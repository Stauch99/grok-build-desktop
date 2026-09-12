import { describe, expect, it } from "vitest";
import { adapterSessions, allAdapterSessions } from "./agent-adapters";

describe("adapterSessions", () => {
  const row = {
    id: "s1",
    cwd: "/a",
    title: "A",
    updatedAt: "2026-01-02",
    createdAt: "2026-01-01",
    numMessages: 1,
  };

  it("only grok returns disk rows this round", () => {
    expect(adapterSessions("grok", [row])[0]?.agentId).toBe("grok");
    expect(adapterSessions("kimi", [row])).toEqual([]);
    expect(adapterSessions("claude", [row])).toEqual([]);
    expect(adapterSessions("codex", [row])).toEqual([]);
    expect(allAdapterSessions([row]).map((s) => s.agentId)).toEqual(["grok"]);
  });
});
