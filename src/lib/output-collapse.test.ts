import { describe, expect, it } from "vitest";
import { collapseToolOutput } from "./output-collapse";

const many = Array.from({ length: 20 }, (_, i) => `line ${i + 1}`).join("\n");

describe("collapseToolOutput", () => {
  it("passes short output through", () => {
    expect(collapseToolOutput("a\nb\nc", false)).toBeNull();
    expect(collapseToolOutput(undefined, false)).toBeNull();
  });

  it("splits long output into a head and a counted tail", () => {
    const out = collapseToolOutput(many, false);
    expect(out).not.toBeNull();
    expect(out!.head.split("\n")).toHaveLength(6);
    expect(out!.head).toContain("line 6");
    expect(out!.rest).toContain("line 7");
    expect(out!.hidden).toBe(14);
  });

  it("never collapses while the call is still live", () => {
    expect(collapseToolOutput(many, true)).toBeNull();
  });
});
