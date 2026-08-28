import { describe, expect, it } from "vitest";
import {
  IMAGE_ZOOM_MAX,
  IMAGE_ZOOM_MIN,
  MAX_PREVIEW_TABS,
  activeTabAfterClose,
  afterPreviewSave,
  clampImageZoom,
  fileExt,
  imageTransform,
  isMarkdown,
  isTextPreviewable,
  lineGutter,
  panImage,
  previewErrorCopy,
  previewKind,
  previewSaveToast,
  putPreviewCache,
  relativeTo,
  removePreviewTab,
  upsertPreviewTab,
  zoomByWheel,
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
  it("renders markdown, shows code as source, and previews media inline", () => {
    expect(previewKind("a/b.md")).toBe("markdown");
    expect(previewKind("a/b.ts")).toBe("code");
    expect(previewKind("a/b.html")).toBe("html");
    expect(previewKind("a/b.png")).toBe("image");
    expect(previewKind("a/b.mp4")).toBe("video");
    expect(previewKind("a/b.svg")).toBe("image");
    expect(previewKind("a/b.zip")).toBe("unsupported");
  });
});

describe("previewErrorCopy", () => {
  it("turns the desktop path guard into Chinese", () => {
    expect(previewErrorCopy("path not allowed")).toBe("无法预览这个文件");
    expect(previewErrorCopy("Error: caller workspace does not match trusted workspace")).toMatch(/工作区/);
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

describe("preview tabs", () => {
  it("caps open tabs at 8 and does not duplicate a path", () => {
    expect(MAX_PREVIEW_TABS).toBe(8);
    let tabs = Array.from({ length: 8 }, (_, i) => ({ path: `/a/${i}.ts` }));
    tabs = upsertPreviewTab(tabs, "/a/0.ts");
    expect(tabs).toHaveLength(8);
    tabs = upsertPreviewTab(tabs, "/a/new.ts");
    expect(tabs).toHaveLength(8);
    expect(tabs.some((t) => t.path === "/a/0.ts")).toBe(false);
    expect(tabs.at(-1)?.path).toBe("/a/new.ts");
  });

  it("removes a tab and picks a neighbor as the next active path", () => {
    const tabs = [{ path: "/a.ts" }, { path: "/b.ts" }, { path: "/c.ts" }];
    expect(removePreviewTab(tabs, "/b.ts")).toEqual([{ path: "/a.ts" }, { path: "/c.ts" }]);
    expect(activeTabAfterClose(tabs, "/b.ts", "/b.ts")).toBe("/c.ts");
    expect(activeTabAfterClose(tabs, "/c.ts", "/c.ts")).toBe("/b.ts");
    expect(activeTabAfterClose([{ path: "/a.ts" }], "/a.ts", "/a.ts")).toBeNull();
  });

  it("keeps other files in the text cache when switching", () => {
    const cache = new Map<string, { text: string; mtime: number }>();
    putPreviewCache(cache, "/a.ts", "A", 1);
    putPreviewCache(cache, "/b.ts", "B", 2);
    expect(cache.get("/a.ts")).toEqual({ text: "A", mtime: 1 });
    expect(cache.get("/b.ts")?.text).toBe("B");
  });
});

describe("image zoom", () => {
  it("clamps wheel zoom to 0.25–8", () => {
    expect(IMAGE_ZOOM_MIN).toBe(0.25);
    expect(IMAGE_ZOOM_MAX).toBe(8);
    expect(clampImageZoom(0.1)).toBe(0.25);
    expect(clampImageZoom(10)).toBe(8);
    expect(zoomByWheel(1, 100)).toBeLessThan(1);
    expect(zoomByWheel(1, -100)).toBeGreaterThan(1);
    expect(zoomByWheel(0.25, 400)).toBe(0.25);
    expect(zoomByWheel(8, -400)).toBe(8);
  });

  it("pans and emits a CSS transform", () => {
    expect(panImage({ x: 2, y: 3 }, 4, -1)).toEqual({ x: 6, y: 2 });
    expect(imageTransform({ zoom: 2, x: 10, y: -4 })).toBe("translate(10px, -4px) scale(2)");
  });
});

describe("line gutter", () => {
  it("matches split lines including a trailing empty line", () => {
    expect(lineGutter("a\nb")).toEqual([1, 2]);
    expect(lineGutter("a\n")).toEqual([1, 2]);
    expect(lineGutter("")).toEqual([1]);
  });
});

describe("save feedback", () => {
  it("returns success and failure toast copy", () => {
    expect(previewSaveToast(true)).toBe("已保存");
    expect(previewSaveToast(false, new Error("disk full"))).toBe("disk full");
    expect(previewSaveToast(false)).toBe("保存失败");
  });

  it("refreshes git only after a successful save", () => {
    let n = 0;
    afterPreviewSave(true, () => {
      n += 1;
    });
    afterPreviewSave(false, () => {
      n += 1;
    });
    afterPreviewSave(true);
    expect(n).toBe(1);
  });
});
