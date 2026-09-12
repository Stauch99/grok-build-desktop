import { describe, expect, it } from "vitest";
import { brandSessionList } from "./session-list";

describe("brandSessionList", () => {
  it("stamps grok on bare rows", () => {
    expect(brandSessionList([{ id: "s1" }, { id: "s2", agentId: "claude" }]).map((s) => s.agentId)).toEqual([
      "grok",
      "claude",
    ]);
  });
});
