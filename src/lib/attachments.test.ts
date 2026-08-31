import { describe, expect, it } from "vitest";
import {
  addAttachments,
  attachmentChipLayout,
  attachmentFromPath,
  attachmentIconLabel,
  attachmentMeta,
  attachmentVisualKind,
  ATTACHMENT_BYTE_CAP,
  clipboardAttachHits,
  formatAttachmentsPrompt,
  formatBytes,
  isFileDrag,
  isFilesystemPath,
  normalizeAttachmentPath,
  pasteFileExt,
  pathsFromDataTransfer,
  pathsFromFileUriList,
  pathsFromTauriDrop,
  rejectAttachment,
  resolveAttachPath,
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
    expect(attachmentVisualKind("archive.zip", "file")).toBe("zip");
    expect(attachmentVisualKind("plan.docx", "file")).toBe("word");
    expect(attachmentVisualKind("sheet.xlsx", "file")).toBe("excel");
    expect(attachmentVisualKind("deck.pptx", "file")).toBe("ppt");
    expect(attachmentVisualKind("main.ts", "file")).toBe("code");
    expect(attachmentVisualKind("notes.txt", "file")).toBe("other");
  });
});

describe("attachmentChipLayout", () => {
  it("uses a square thumb for images and a file card otherwise", () => {
    expect(attachmentChipLayout("image")).toBe("thumb");
    expect(attachmentChipLayout("pdf")).toBe("file");
    expect(attachmentChipLayout("folder")).toBe("file");
  });
});

describe("pasteFileExt", () => {
  it("prefers a safe filename extension", () => {
    expect(pasteFileExt("shot.PNG", "image/png")).toBe("png");
    expect(pasteFileExt("doc.pdf", "application/octet-stream")).toBe("pdf");
  });

  it("falls back to the mime type and rejects path bits", () => {
    expect(pasteFileExt("untitled", "image/jpeg")).toBe("jpg");
    expect(pasteFileExt("../evil.png", "image/png")).toBe("png");
    expect(pasteFileExt("file.exe.sh", "application/x-sh")).toBe("bin");
  });
});

describe("isFilesystemPath", () => {
  it("rejects a webkit drag virtual path and keeps real unix paths", () => {
    expect(isFilesystemPath("/report.pdf")).toBe(false);
    expect(isFilesystemPath("/Users/me/Desktop/report.pdf")).toBe(true);
    expect(isFilesystemPath("/tmp/notes.md")).toBe(true);
  });
});

describe("pathsFromDataTransfer", () => {
  it("does not treat a webkit drag fullPath as a filesystem path", async () => {
    const file = new File([new Uint8Array([1, 2, 3])], "report.pdf", { type: "application/pdf" });
    const dt = {
      types: ["Files"],
      items: [
        {
          kind: "file",
          webkitGetAsEntry: () => ({ isFile: true, isDirectory: false, fullPath: "/report.pdf" }),
          getAsFile: () => file,
        },
      ],
      files: [file],
      getData: () => "",
    } as unknown as DataTransfer;
    expect(await pathsFromDataTransfer(dt)).toEqual([]);
    expect(clipboardAttachHits(dt)).toEqual([{ kind: "blob", file }]);
  });
});

describe("pathsFromFileUriList", () => {
  it("decodes file:// URLs and skips http", () => {
    expect(
      pathsFromFileUriList("file:///Users/me/my%20plan.pdf\nhttps://example.com/a.png"),
    ).toEqual(["/Users/me/my plan.pdf"]);
  });
});

describe("clipboardAttachHits", () => {
  function dt(opts: {
    files?: File[];
    items?: Array<{ kind: string; getAsFile: () => File | null }>;
    uriList?: string;
  }): DataTransfer {
    const files = opts.files ?? [];
    const items =
      opts.items ??
      files.map((file) => ({ kind: "file", getAsFile: () => file }));
    return {
      files,
      items,
      types: opts.uriList ? ["text/uri-list"] : files.length ? ["Files"] : [],
      getData: (type: string) => (type === "text/uri-list" ? (opts.uriList ?? "") : ""),
    } as unknown as DataTransfer;
  }

  function fileWithPath(name: string, path: string, type = "image/png"): File {
    const file = new File([new Uint8Array([1, 2, 3])], name, { type });
    Object.defineProperty(file, "path", { value: path });
    return file;
  }

  it("treats a pasted image without a filesystem path as a blob", () => {
    const file = new File([new Uint8Array([137, 80, 78, 71])], "image.png", { type: "image/png" });
    expect(clipboardAttachHits(dt({ files: [file] }))).toEqual([{ kind: "blob", file }]);
  });

  it("uses the Tauri file path when the webview exposes one", () => {
    const file = fileWithPath("shot.png", "/Users/me/proj/shot.png");
    expect(clipboardAttachHits(dt({ files: [file] }))).toEqual([
      { kind: "path", path: "/Users/me/proj/shot.png", fileKind: "file", bytes: 3 },
    ]);
  });

  it("picks file:// URLs from the uri-list when Files is empty", () => {
    expect(clipboardAttachHits(dt({ uriList: "file:///tmp/notes.md" }))).toEqual([
      { kind: "path", path: "/tmp/notes.md", fileKind: "file" },
    ]);
  });

  it("ignores a plain text paste", () => {
    expect(
      clipboardAttachHits(
        dt({
          files: [],
          items: [{ kind: "string", getAsFile: () => null }],
        }),
      ),
    ).toEqual([]);
  });
});

describe("rejectAttachment", () => {
  it("rejects files over 20MB with a toast line", () => {
    expect(rejectAttachment({ name: "big.bin", bytes: ATTACHMENT_BYTE_CAP + 1 })).toBe(
      "文件太大：big.bin（上限 20 MB）",
    );
  });

  it("rejects oversized files with a toast line", () => {
    expect(rejectAttachment({ name: "big.bin", bytes: 30 * 1024 * 1024 })).toBe(
      "文件太大：big.bin（上限 20 MB）",
    );
  });

  it("rejects nameless drops", () => {
    expect(rejectAttachment({ name: "   ", bytes: 12 })).toBe("无法添加没有名字的附件");
  });

  it("allows a normal file", () => {
    expect(rejectAttachment({ name: "note.md", bytes: 1200 })).toBeNull();
  });
});

describe("resolveAttachPath", () => {
  it("stats files and keeps them when under the cap", async () => {
    const stat = async () => ({ path: "/tmp/note.md", bytes: 1200, kind: "file" as const });
    await expect(resolveAttachPath({ path: "/tmp/note.md", kind: "file" }, stat)).resolves.toEqual({
      attachment: attachmentFromPath("/tmp/note.md", "file", 1200),
    });
  });

  it("drops files when stat fails or size is over the cap", async () => {
    const over = async () => ({
      path: "/tmp/big.bin",
      bytes: ATTACHMENT_BYTE_CAP + 1,
      kind: "file" as const,
    });
    await expect(resolveAttachPath({ path: "/tmp/big.bin", kind: "file" }, over)).resolves.toEqual({
      reason: "文件太大：big.bin（上限 20 MB）",
    });

    const fail = async () => {
      throw new Error("附件不存在");
    };
    await expect(resolveAttachPath({ path: "/tmp/gone.md", kind: "file" }, fail)).resolves.toEqual({
      reason: "附件不存在",
    });
  });

  it("keeps workspace folders as path references", async () => {
    let imported = 0;
    const stat = async () => ({ path: "/proj/src", bytes: 0, kind: "dir" as const });
    const importFile = async () => {
      imported += 1;
      return { path: "/unused", bytes: 0, name: "src", kind: "dir" as const };
    };
    await expect(
      resolveAttachPath({ path: "/proj/src", kind: "dir" }, stat, importFile),
    ).resolves.toEqual({
      attachment: attachmentFromPath("/proj/src", "dir"),
    });
    expect(imported).toBe(0);
  });

  it("copies a file into pastes when it is outside the workspace", async () => {
    const stat = async () => {
      throw new Error("附件不在工作区");
    };
    const importFile = async () => ({
      path: "/Users/me/.grok/sessions/pastes/9-plan.pdf",
      bytes: 12,
      name: "plan.pdf",
    });
    await expect(
      resolveAttachPath({ path: "/Users/me/Desktop/plan.pdf", kind: "file" }, stat, importFile),
    ).resolves.toEqual({
      attachment: {
        path: "/Users/me/.grok/sessions/pastes/9-plan.pdf",
        name: "plan.pdf",
        kind: "file",
        bytes: 12,
      },
    });
  });

  it("keeps the original folder path when it is outside the workspace", async () => {
    let imported = 0;
    const stat = async () => {
      throw new Error("附件不在工作区");
    };
    const importFile = async () => {
      imported += 1;
      throw new Error("文件太大");
    };
    await expect(
      resolveAttachPath({ path: "/Users/me/Desktop/notes", kind: "dir" }, stat, importFile),
    ).resolves.toEqual({
      attachment: attachmentFromPath("/Users/me/Desktop/notes", "dir"),
    });
    expect(imported).toBe(0);
  });

  it("uses the original path when stat reports a directory, even if the drop called it a file", async () => {
    let imported = 0;
    const stat = async () => ({ path: "/Users/me/Desktop/notes", bytes: 0, kind: "dir" as const });
    const importFile = async () => {
      imported += 1;
      throw new Error("文件太大");
    };
    await expect(
      resolveAttachPath({ path: "/Users/me/Desktop/notes", kind: "file" }, stat, importFile),
    ).resolves.toEqual({
      attachment: attachmentFromPath("/Users/me/Desktop/notes", "dir"),
    });
    expect(imported).toBe(0);
  });

  it("imports when Tauri returns the outside-workspace error as a payload object", async () => {
    const stat = async () => {
      throw { message: "附件不在工作区" };
    };
    const importFile = async () => ({
      path: "/Users/me/.grok/sessions/pastes/9-plan.pdf",
      bytes: 12,
      name: "plan.pdf",
      kind: "file" as const,
    });
    await expect(
      resolveAttachPath({ path: "/Users/me/Desktop/plan.pdf", kind: "file" }, stat, importFile),
    ).resolves.toMatchObject({
      attachment: { name: "plan.pdf", kind: "file" },
    });
  });
});
