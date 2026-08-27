import { describe, expect, it } from "vitest";
import { hubEmptyKind } from "./hub-empty";

describe("hubEmptyKind", () => {
  it("prefers search when a query has no hits", () => {
    expect(hubEmptyKind({ tab: "skills", query: "zzz", count: 0 })).toBe("search");
  });

  it("uses the tab empty when the list is vacant", () => {
    expect(hubEmptyKind({ tab: "mcp", query: "", count: 0 })).toBe("mcp");
    expect(hubEmptyKind({ tab: "marketplace", query: "", count: 0 })).toBe("market");
    expect(hubEmptyKind({ tab: "marketplace", query: "", count: 0, marketFailed: true })).toBe("market-fail");
  });

  it("is silent when there are rows", () => {
    expect(hubEmptyKind({ tab: "skills", query: "", count: 3 })).toBeNull();
  });
});
