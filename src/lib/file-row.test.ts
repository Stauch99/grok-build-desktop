import { describe, expect, it } from "vitest";
import { fileListEntry } from "./file-row";

describe("fileListEntry", () => {
  it("shows the basename and a parent crumb inside the workspace", () => {
    expect(fileListEntry("/work/src/App.tsx", "/work")).toEqual({
      name: "App.tsx",
      crumb: "src",
    });
  });

  it("omits the crumb for a file at the workspace root", () => {
    expect(fileListEntry("/work/README.md", "/work")).toEqual({
      name: "README.md",
      crumb: "",
    });
  });

  it("uses the parent path as a crumb instead of nesting folders", () => {
    expect(
      fileListEntry("/Users/foxie/Desktop/平安家办代理人培训沙龙_30分钟演讲稿.md", "/work"),
    ).toEqual({
      name: "平安家办代理人培训沙龙_30分钟演讲稿.md",
      crumb: "Users/foxie/Desktop",
    });
  });

  it("treats a repo-relative git path as a single row", () => {
    expect(fileListEntry("src/lib/git.ts")).toEqual({
      name: "git.ts",
      crumb: "src/lib",
    });
  });
});
