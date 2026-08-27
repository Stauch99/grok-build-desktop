import { describe, expect, it } from "vitest";
import { firstHitIndex, highlightQuery } from "./search-highlight";

describe("search highlight", () => {
  it("splits hits", () => {
    expect(highlightQuery("Fix login bug", "login")).toEqual([
      { text: "Fix ", hit: false },
      { text: "login", hit: true },
      { text: " bug", hit: false },
    ]);
  });

  it("jumps to the first matching turn", () => {
    expect(
      firstHitIndex(
        [
          { id: "u1", text: "hello" },
          { id: "u2", text: "please rewind this" },
        ],
        "rewind",
      ),
    ).toBe("u2");
  });
});
