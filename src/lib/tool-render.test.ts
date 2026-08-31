import { describe, expect, it } from "vitest";
import type { ChatItem } from "./chat";
import {
  bashTools,
  classifyTool,
  compressLabel,
  compressTimeline,
  diffStatLabel,
  bashCommandPreview,
  previewLines,
  toolLineCopy,
} from "./tool-render";
import type { WorkItem } from "./chat";

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

describe("bashCommandPreview", () => {
  it("strips an Execute prefix and keeps a short command whole", () => {
    expect(bashCommandPreview("Execute `ls -la`")).toEqual({
      full: "`ls -la`",
      preview: "`ls -la`",
      truncated: false,
    });
  });

  it("clips a multi-line command to 4 lines and keeps the full text", () => {
    const body = ["a", "b", "c", "d", "e", "f"].join("\n");
    expect(bashCommandPreview(`Execute ${body}`)).toEqual({
      full: body,
      preview: "a\nb\nc\nd",
      truncated: true,
    });
  });
});

function tool(
  id: string,
  title: string,
  toolKind?: string,
): Extract<WorkItem, { kind: "tool" }> {
  return { kind: "tool", id, title, toolKind, status: "completed" };
}

describe("compressTimeline", () => {
  it("leaves a single read or call as its own row", () => {
    const items: WorkItem[] = [tool("r1", "Read a.ts", "read"), tool("c1", "List dir")];
    expect(compressTimeline(items)).toEqual([
      { kind: "item", item: items[0] },
      { kind: "item", item: items[1] },
    ]);
  });

  it("folds consecutive reads into 读取 N 次", () => {
    const items: WorkItem[] = [
      tool("r1", "Read a.ts", "read"),
      tool("r2", "Read b.ts", "read"),
      tool("r3", "Read c.ts", "read"),
    ];
    expect(compressTimeline(items)).toEqual([{ kind: "group", cls: "read", items }]);
    expect(compressLabel("read", 3)).toBe("读取 3 次");
  });

  it("folds consecutive generic calls into 调用 N 次", () => {
    const items: WorkItem[] = [tool("c1", "List inbox"), tool("c2", "List docs")];
    expect(compressTimeline(items)).toEqual([{ kind: "group", cls: "call", items }]);
    expect(compressLabel("call", 2)).toBe("调用 2 次");
  });

  it("folds consecutive bash, edit, and search runs", () => {
    const bash = [tool("b1", "Bash: ls", "execute"), tool("b2", "Bash: pwd", "execute")];
    const edits = [tool("e1", "Edit a.ts", "edit"), tool("e2", "Edit b.ts", "edit")];
    const searches = [tool("s1", "Search foo", "search"), tool("s2", "Search bar", "search")];
    expect(compressTimeline(bash)).toEqual([{ kind: "group", cls: "bash", items: bash }]);
    expect(compressTimeline(edits)).toEqual([{ kind: "group", cls: "edit", items: edits }]);
    expect(compressTimeline(searches)).toEqual([{ kind: "group", cls: "search", items: searches }]);
    expect(compressLabel("bash", 2)).toBe("运行命令 2 次");
    expect(compressLabel("edit", 2)).toBe("编辑 2 次");
    expect(compressLabel("search", 2)).toBe("搜索 2 次");
  });

  it("does not fold across thoughts or a different compress class", () => {
    const thought: WorkItem = { kind: "thought", id: "t1", text: "hmm" };
    const items: WorkItem[] = [
      tool("r1", "Read a.ts", "read"),
      tool("r2", "Read b.ts", "read"),
      thought,
      tool("r3", "Read c.ts", "read"),
      tool("e1", "Edit a.ts", "edit"),
      tool("c1", "List"),
      tool("c2", "List"),
    ];
    const rows = compressTimeline(items);
    expect(rows.map((r) => (r.kind === "group" ? `${r.cls}:${r.items.length}` : r.item.id))).toEqual([
      "read:2",
      "t1",
      "r3",
      "e1",
      "call:2",
    ]);
  });
});
