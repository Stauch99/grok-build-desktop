import { describe, expect, it } from "vitest";
import {
  openIdsFromBindings,
  presenceAcrossWindows,
  presenceClass,
  sessionPresence,
  unionOpenIds,
} from "./session-presence";

describe("sessionPresence", () => {
  it("marks the focused session deepest, other open sessions as open", () => {
    expect(sessionPresence("a", ["a", "b"], "a")).toBe("focused");
    expect(sessionPresence("b", ["a", "b"], "a")).toBe("open");
    expect(sessionPresence("c", ["a", "b"], "a")).toBe("idle");
  });

  it("does not treat a focused id as focused unless it is also open", () => {
    expect(sessionPresence("gone", ["a"], "gone")).toBe("idle");
  });
});

describe("presenceClass", () => {
  it("maps to sidebar row classes", () => {
    expect(presenceClass("focused")).toBe("active");
    expect(presenceClass("open")).toBe("open");
    expect(presenceClass("idle")).toBe("");
  });
});

describe("unionOpenIds", () => {
  it("unions open sessions across windows without duplicates", () => {
    expect(unionOpenIds(["a", "b"], ["b", "c"], ["a"])).toEqual(["a", "b", "c"]);
  });
});

describe("presenceAcrossWindows", () => {
  it("uses every window's open set and the OS-focused window's focused session", () => {
    expect(
      presenceAcrossWindows("b", [
        { openIds: ["a"], focusedId: "a", osFocused: false },
        { openIds: ["b"], focusedId: "b", osFocused: true },
      ]),
    ).toBe("focused");
    expect(
      presenceAcrossWindows("a", [
        { openIds: ["a"], focusedId: "a", osFocused: false },
        { openIds: ["b"], focusedId: "b", osFocused: true },
      ]),
    ).toBe("open");
  });
});

describe("openIdsFromBindings", () => {
  it("drops empty pane bindings", () => {
    expect(openIdsFromBindings({ main: "a", p2: "b", p3: null })).toEqual(["a", "b"]);
  });
});
