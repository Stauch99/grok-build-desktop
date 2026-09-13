import { describe, expect, it } from "vitest";
import { nextTurnIndex } from "./turn-nav";

const ids = ["u1", "u2", "u3"];

describe("nextTurnIndex", () => {
  it("moves down and up from the active turn", () => {
    expect(nextTurnIndex(ids, "u1", 1)).toBe(1);
    expect(nextTurnIndex(ids, "u3", -1)).toBe(1);
  });

  it("clamps at the first and last turn instead of wrapping", () => {
    expect(nextTurnIndex(ids, "u1", -1)).toBe(0);
    expect(nextTurnIndex(ids, "u3", 1)).toBe(2);
  });

  it("picks an end when no turn is active yet", () => {
    expect(nextTurnIndex(ids, null, 1)).toBe(0);
    expect(nextTurnIndex(ids, null, -1)).toBe(2);
    expect(nextTurnIndex(ids, "gone", 1)).toBe(0);
    expect(nextTurnIndex(ids, "gone", -1)).toBe(2);
  });

  it("returns -1 for an empty turn list", () => {
    expect(nextTurnIndex([], "u1", 1)).toBe(-1);
  });
});
