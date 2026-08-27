import { describe, expect, it } from "vitest";
import { millerPath, millerPush, millerRoot } from "./miller";

describe("miller", () => {
  it("starts at the workspace root", () => {
    expect(millerRoot("/tmp/proj")).toEqual([{ path: "/tmp/proj", name: "proj" }]);
  });

  it("pushes a folder column", () => {
    const stack = millerPush(millerRoot("/tmp/proj"), { path: "/tmp/proj/src", name: "src" });
    expect(millerPath(stack)).toBe("/tmp/proj/src");
    expect(stack).toHaveLength(2);
  });
});
