import { describe, expect, it } from "vitest";
import { HUB_TABS } from "./commands";

describe("HUB_TABS", () => {
  it("is skills mcp marketplace hooks", () => {
    expect(HUB_TABS).toEqual(["skills", "mcp", "marketplace", "hooks"]);
  });
});
