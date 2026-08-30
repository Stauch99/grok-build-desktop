import { describe, expect, it } from "vitest";
import { dismissInjected, markInjected } from "./memory-inject-session";

describe("markInjected", () => {
  it("adds the session when injected is true", () => {
    const prev = new Set(["s1"]);
    const next = markInjected(prev, "s2", true);
    expect(next.has("s2")).toBe(true);
    expect(next.has("s1")).toBe(true);
    expect(prev.has("s2")).toBe(false);
  });

  it("does not add the session when injected is false", () => {
    const prev = new Set(["s1"]);
    const next = markInjected(prev, "s2", false);
    expect(next.has("s2")).toBe(false);
    expect([...next]).toEqual(["s1"]);
  });
});

describe("dismissInjected", () => {
  it("removes only that session", () => {
    const prev = new Set(["s1", "s2"]);
    const next = dismissInjected(prev, "s1");
    expect(next.has("s1")).toBe(false);
    expect(next.has("s2")).toBe(true);
    expect(prev.has("s1")).toBe(true);
  });
});
