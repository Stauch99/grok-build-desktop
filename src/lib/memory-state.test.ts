import { describe, expect, it } from "vitest";
import { emptyMemoryState, parseMemoryState } from "./memory-state";

describe("parseMemoryState", () => {
  it("defaults missing fields", () => {
    expect(parseMemoryState({})).toEqual(emptyMemoryState());
    expect(parseMemoryState({ lastStatus: "running", lastDreamAgentId: "claude" }).lastDreamAgentId).toBe("claude");
  });
});
