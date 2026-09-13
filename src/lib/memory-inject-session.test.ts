import { describe, expect, it } from "vitest";
import { chatHasPromptHistory, dismissInjected, markInjected, markStarted } from "./memory-inject-session";

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

describe("markStarted", () => {
  it("always adds the session even when wrap did not inject", () => {
    const prev = new Set(["s1"]);
    const next = markStarted(prev, "s2");
    expect(next.has("s2")).toBe(true);
    expect(next.has("s1")).toBe(true);
    expect(prev.has("s2")).toBe(false);
  });

  it("is independent of the chip set", () => {
    const started = markStarted(new Set(), "s1");
    const chip = markInjected(new Set(), "s1", false);
    expect(started.has("s1")).toBe(true);
    expect(chip.has("s1")).toBe(false);
  });
});

describe("chatHasPromptHistory", () => {
  it("is true when a user or assistant turn exists", () => {
    expect(chatHasPromptHistory([{ kind: "user" }])).toBe(true);
    expect(chatHasPromptHistory([{ kind: "assistant" }])).toBe(true);
  });

  it("is false for an empty or tool-only transcript", () => {
    expect(chatHasPromptHistory([])).toBe(false);
    expect(chatHasPromptHistory([{ kind: "tool" }])).toBe(false);
  });
});
