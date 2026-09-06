import { describe, expect, it } from "vitest";
import { tocActiveId } from "./toc-active";

describe("tocActiveId", () => {
  it("picks the intersecting turn with the highest ratio", () => {
    expect(tocActiveId([])).toBeNull();
    expect(
      tocActiveId([
        { id: "a", ratio: 0.1 },
        { id: "b", ratio: 0.8 },
        { id: "c", ratio: 0.2 },
      ]),
    ).toBe("b");
  });
});
