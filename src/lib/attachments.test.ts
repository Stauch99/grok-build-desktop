import { describe, expect, it } from "vitest";
import {
  addAttachments,
  attachmentFromPath,
  attachmentIconLabel,
  attachmentMeta,
  attachmentVisualKind,
  formatAttachmentsPrompt,
  formatBytes,
  isFileDrag,
  normalizeAttachmentPath,
  pathsFromTauriDrop,
  rejectAttachment,
} from "./attachments";

describe("attachmentFromPath", () => {
  it("normalizes directories with a trailing slash", () => {
    expect(attachmentFromPath("/tmp/proj/src")).toMatchObject({
      path: "/tmp/proj/src",
      name: "src",
      kind: "file",
    });
    expect(attachmentFromPath("/tmp/proj/src", "dir")).toMatchObject({
      path: "/tmp/proj/src/",
      name: "src",
      kind: "dir",
    });
  });
});

describe("normalizeAttachmentPath", () => {
  it("strips trailing slashes from files", () => {
    expect(normalizeAttachmentPath("/a/b/", "file")).toBe("/a/b");
  });
});

describe("addAttachments", () => {
  it("dedupes by path and caps the list", () => {
    const a = attachmentFromPath("/a.ts");
    const b = attachmentFromPath("/b.ts");
    const { next, dropped } = addAttachments([a], [a, b, b], 2);
    expect(next).toHaveLength(2);
    expect(next[0].path).toBe("/a.ts");
    expect(next[1].path).toBe("/b.ts");
    expect(dropped).toBe(0);
  });

  it("counts overflow when over the cap", () => {
    const base = attachmentFromPath("/keep.ts");
    const incoming = Array.from({ length: 3 }, (_, i) => attachmentFromPath(`/f${i}.ts`));
    const { next, dropped } = addAttachments([base], incoming, 2);
    expect(next).toHaveLength(2);
    expect(dropped).toBe(2);
  });
});

describe("formatAttachmentsPrompt", () => {
  it("joins chips before typed text", () => {
    const list = [attachmentFromPath("/a.ts"), attachmentFromPath("/src", "dir")];
    expect(formatAttachmentsPrompt(list, "hello")).toBe("@/a.ts @/src/ hello");
  });

  it("returns only tokens when text is empty", () => {
    const list = [attachmentFromPath("/a.ts")];
    expect(formatAttachmentsPrompt(list, "  ")).toBe("@/a.ts");
  });

  it("returns only text when there are no chips", () => {
    expect(formatAttachmentsPrompt([], "hello")).toBe("hello");
  });
});

describe("isFileDrag", () => {
  it("detects file drags", () => {
    const dt = {
      types: ["Files"],
      items: [{ kind: "file" }],
    } as unknown as DataTransfer;
    expect(isFileDrag(dt)).toBe(true);
  });

  it("ignores plain text drags", () => {
    const dt = {
      types: ["text/plain"],
      items: [{ kind: "string" }],
    } as unknown as DataTransfer;
    expect(isFileDrag(dt)).toBe(false);
  });
});

describe("pathsFromTauriDrop", () => {
  it("maps absolute paths to attachments", () => {
    expect(pathsFromTauriDrop(["/tmp/a.ts", "relative"])).toEqual([
      attachmentFromPath("/tmp/a.ts"),
    ]);
  });
});

describe("formatBytes", () => {
  it("formats small and large sizes", () => {
    expect(formatBytes(512)).toBe("512 B");
    expect(formatBytes(71342)).toBe("69.7 KB");
    expect(formatBytes(1024 * 1024)).toBe("1 MB");
  });
});

describe("attachmentMeta", () => {
  it("shows folder label for directories", () => {
    expect(attachmentMeta(attachmentFromPath("/tmp/src", "dir"))).toBe("文件夹");
  });

  it("shows ext and size when bytes are known", () => {
    expect(attachmentMeta(attachmentFromPath("/tmp/readme.md", "file", 71342))).toBe(
      "MD 69.7 KB",
    );
  });

  it("shows ext only when size is unknown", () => {
    expect(attachmentMeta(attachmentFromPath("/tmp/readme.md"))).toBe("MD");
  });
});

describe("attachmentIconLabel", () => {
  it("picks labels by file type", () => {
    expect(attachmentIconLabel("doc.pdf", "file")).toBe("PDF");
    expect(attachmentIconLabel("note.md", "file")).toBe("MD");
    expect(attachmentIconLabel("photo.png", "file")).toBe("IMG");
    expect(attachmentIconLabel("src", "dir")).toBe("▸");
  });
});

describe("attachmentVisualKind", () => {
  it("classifies common types", () => {
    expect(attachmentVisualKind("a.pdf", "file")).toBe("pdf");
    expect(attachmentVisualKind("a.md", "file")).toBe("md");
    expect(attachmentVisualKind("a.png", "file")).toBe("image");
    expect(attachmentVisualKind("src", "dir")).toBe("folder");
    expect(attachmentVisualKind("archive.zip", "file")).toBe("other");
  });
});

describe("rejectAttachment", () => {
  it("rejects oversized files with a toast line", () => {
    expect(rejectAttachment({ name: "big.bin", bytes: 30 * 1024 * 1024 })).toBe(
      "文件太大：big.bin（上限 25 MB）",
    );
  });

  it("rejects nameless drops", () => {
    expect(rejectAttachment({ name: "   ", bytes: 12 })).toBe("无法添加没有名字的附件");
  });

  it("allows a normal file", () => {
    expect(rejectAttachment({ name: "note.md", bytes: 1200 })).toBeNull();
  });
});
