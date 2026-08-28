import { describe, expect, it } from "vitest";
import { millerPath, millerPush, millerRoot, nestPaths } from "./miller";

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

describe("nestPaths", () => {
  it("returns an empty tree for no paths", () => {
    expect(nestPaths([])).toEqual([]);
  });

  it("keeps a single file as a leaf", () => {
    expect(nestPaths(["README.md"])).toEqual([{ name: "README.md", path: "README.md" }]);
  });

  it("nests directory segments under parents", () => {
    expect(nestPaths(["src/lib/miller.ts"])).toEqual([
      {
        name: "src",
        path: "src",
        children: [
          {
            name: "lib",
            path: "src/lib",
            children: [{ name: "miller.ts", path: "src/lib/miller.ts" }],
          },
        ],
      },
    ]);
  });

  it("groups siblings under the same folder", () => {
    expect(nestPaths(["src/a.ts", "src/b.ts", "README.md"])).toEqual([
      {
        name: "src",
        path: "src",
        children: [
          { name: "a.ts", path: "src/a.ts" },
          { name: "b.ts", path: "src/b.ts" },
        ],
      },
      { name: "README.md", path: "README.md" },
    ]);
  });

  it("preserves absolute path prefixes", () => {
    expect(nestPaths(["/tmp/proj/src/a.ts", "/tmp/proj/src/b.ts"])).toEqual([
      {
        name: "tmp",
        path: "/tmp",
        children: [
          {
            name: "proj",
            path: "/tmp/proj",
            children: [
              {
                name: "src",
                path: "/tmp/proj/src",
                children: [
                  { name: "a.ts", path: "/tmp/proj/src/a.ts" },
                  { name: "b.ts", path: "/tmp/proj/src/b.ts" },
                ],
              },
            ],
          },
        ],
      },
    ]);
  });

  it("skips blanks, trailing slashes, and duplicate paths", () => {
    expect(nestPaths(["", "src/a.ts/", "src/a.ts", "src/a.ts"])).toEqual([
      {
        name: "src",
        path: "src",
        children: [{ name: "a.ts", path: "src/a.ts" }],
      },
    ]);
  });
});
