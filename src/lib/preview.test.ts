import { describe, expect, it } from "vitest";
import {
  fileExt,
  isMarkdown,
  isTextPreviewable,
  previewKind,
  relativeTo,
} from "./preview";

describe("isTextPreviewable", () => {
  it("accepts known text extensions", () => {
    expect(isTextPreviewable("/a/b/readme.md")).toBe(true);
    expect(isTextPreviewable("src/App.tsx")).toBe(true);
  });

  it("rejects binaries", () => {
    expect(isTextPreviewable("/a/b/logo.png")).toBe(false);
    expect(isTextPreviewable("/a/b/app.zip")).toBe(false);
  });

  it("accepts dotfiles and extensionless files", () => {
    expect(isTextPreviewable("/a/.gitignore")).toBe(true);
    expect(isTextPreviewable("/a/Makefile")).toBe(true);
  });
});

describe("fileExt", () => {
  it("lowercases the extension", () => {
    expect(fileExt("/a/README.MD")).toBe("md");
  });

  it("is empty without one", () => {
    expect(fileExt("/a/Makefile")).toBe("");
  });

  it("ignores dots in directories", () => {
    expect(fileExt("/a.b/c/file")).toBe("");
  });
});

describe("isMarkdown", () => {
  it("covers both spellings", () => {
    expect(isMarkdown("notes.md")).toBe(true);
    expect(isMarkdown("notes.markdown")).toBe(true);
  });

  it("is false for code", () => {
    expect(isMarkdown("a.ts")).toBe(false);
  });
});

describe("previewKind", () => {
  it("renders markdown, shows code as source, hands off the rest", () => {
    expect(previewKind("a/b.md")).toBe("markdown");
    expect(previewKind("a/b.ts")).toBe("code");
    expect(previewKind("a/b.html")).toBe("html");
    expect(previewKind("a/b.png")).toBe("unsupported");
  });
});

describe("relativeTo", () => {
  it("strips the workspace root", () => {
    expect(relativeTo("/repo/src/App.tsx", "/repo")).toBe("src/App.tsx");
  });

  it("tolerates a trailing slash on the root", () => {
    expect(relativeTo("/repo/src/App.tsx", "/repo/")).toBe("src/App.tsx");
  });

  it("keeps paths outside the root absolute", () => {
    expect(relativeTo("/other/x.ts", "/repo")).toBe("/other/x.ts");
  });

  it("passes the path through with no root", () => {
    expect(relativeTo("/repo/a.ts", "")).toBe("/repo/a.ts");
  });

  it("shows the basename when the path is the root", () => {
    expect(relativeTo("/repo", "/repo")).toBe("repo");
  });
});
