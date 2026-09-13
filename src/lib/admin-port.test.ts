import { describe, expect, it } from "vitest";
import { emptySessions, grokSessionsFromRows, unionSessions } from "./admin-port";

describe("admin session union", () => {
  it("stamps grok and sorts by updatedAt desc", () => {
    const grok = grokSessionsFromRows([
      { id: "a", cwd: "/a", title: "A", updatedAt: "2026-01-01", createdAt: "2026-01-01", numMessages: 1 },
    ]);
    expect(grok[0]?.agentId).toBe("grok");
    expect(emptySessions("claude")).toEqual([]);
    const claude = [{ agentId: "claude" as const, id: "c", cwd: "/c", title: "C", updatedAt: "2026-02-01", createdAt: "2026-02-01", numMessages: 2 }];
    expect(unionSessions([grok, claude]).map((s) => s.id)).toEqual(["c", "a"]);
  });
});
