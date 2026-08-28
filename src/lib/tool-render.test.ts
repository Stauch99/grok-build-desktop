import { describe, expect, it } from "vitest";
import type { ChatItem } from "./chat";
import { bashTools, classifyTool, diffStatLabel, previewLines, toolLineCopy } from "./tool-render";

it("lists bash-classified tools", () => {
  const items: ChatItem[] = [
    { kind: "tool", id: "1", title: "Bash: ls", toolKind: "execute", status: "completed" },
    { kind: "tool", id: "2", title: "Read f", toolKind: "read", status: "completed" },
    { kind: "user", id: "3", text: "hi" },
  ];
  expect(bashTools(items).map((t) => t.id)).toEqual(["1"]);
});

describe("classifyTool", () => {
  it("classifies by toolKind when present", () => {
    expect(classifyTool("anything", "execute")).toBe("bash");
    expect(classifyTool("file.ts", "read")).toBe("read");
    expect(classifyTool("file.ts", "edit")).toBe("edit");
    expect(classifyTool("query", "search")).toBe("search");
    expect(classifyTool("out.ts", "write")).toBe("write");
  });

  it("falls back to title keywords", () => {
    expect(classifyTool("Bash: ls -la")).toBe("bash");
    expect(classifyTool("Read src/App.tsx")).toBe("read");
    expect(classifyTool("Edit src/lib/chat.ts")).toBe("edit");
    expect(classifyTool("Search for allowlist")).toBe("search");
    expect(classifyTool("Write notes.md")).toBe("write");
  });

  it("returns other for unknown tools", () => {
    expect(classifyTool("Think", "think")).toBe("other");
    expect(classifyTool("Custom tool")).toBe("other");
  });
});

describe("diffStatLabel", () => {
  it("is undefined without a diff or without line changes", () => {
    expect(diffStatLabel()).toBeUndefined();
    expect(diffStatLabel({ oldText: "a\n", newText: "a\n" })).toBeUndefined();
  });

  it("counts added and removed lines", () => {
    expect(diffStatLabel({ oldText: "a\nb\n", newText: "a\nc\nd\n" })).toBe("+2 −1");
    expect(diffStatLabel({ oldText: null, newText: "a\nb\n" })).toBe("+2");
  });
});

describe("toolLineCopy", () => {
  it("uses a Chinese verb and strips a redundant title prefix", () => {
    expect(toolLineCopy("Read src/App.tsx", "read")).toEqual({
      verb: "读取",
      detail: "src/App.tsx",
    });
    expect(toolLineCopy("Bash: ls -la", "execute")).toEqual({
      verb: "运行命令",
      detail: "ls -la",
    });
    expect(toolLineCopy("Edit src/lib/chat.ts")).toEqual({
      verb: "编辑",
      detail: "src/lib/chat.ts",
    });
  });

  it("keeps the title as detail when nothing is left after the prefix", () => {
    expect(toolLineCopy("Search", "search")).toEqual({ verb: "搜索", detail: "Search" });
    expect(toolLineCopy("Custom tool")).toEqual({ verb: "调用", detail: "Custom tool" });
  });
});

describe("previewLines", () => {
  it("returns empty for missing detail", () => {
    expect(previewLines()).toBe("");
    expect(previewLines(undefined)).toBe("");
  });

  it("returns full text when under max lines", () => {
    expect(previewLines("a\nb\nc", 8)).toBe("a\nb\nc");
  });

  it("truncates to max lines (default 8)", () => {
    const lines = Array.from({ length: 12 }, (_, i) => `L${i + 1}`);
    const detail = lines.join("\n");
    const preview = previewLines(detail);
    expect(preview.split("\n")).toHaveLength(8);
    expect(preview).toBe(lines.slice(0, 8).join("\n"));
  });

  it("respects custom max", () => {
    expect(previewLines("a\nb\nc\nd", 2)).toBe("a\nb");
  });
});
