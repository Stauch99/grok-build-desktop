import { describe, expect, it } from "vitest";
import { nextDreamAgent } from "./memory-settings-ui";

describe("nextDreamAgent", () => {
  it("rejects an agent that is not logged in", () => {
    expect(nextDreamAgent("claude", ["grok"])).toBeNull();
  });

  it("keeps a logged-in agent id", () => {
    expect(nextDreamAgent("grok", ["grok"])).toBe("grok");
  });
});
