import { describe, expect, it } from "vitest";
import type { ChatItem } from "./chat";
import {
  buildSessionExport,
  exportFilename,
  parseSessionImport,
  sessionToJson,
  sessionToMarkdown,
  viewOnlyItems,
} from "./session-io";

const items: ChatItem[] = [
  { kind: "user", id: "u1", text: "你好" },
  { kind: "assistant", id: "a1", text: "你好，有什么可以帮忙的" },
];

describe("buildSessionExport", () => {
  it("includes summary and items", () => {
    const exp = buildSessionExport(items);
    expect(exp.summary).toBe("你好\n你好，有什么可以帮忙的");
    expect(exp.items).toEqual(items);
  });
});

describe("sessionToMarkdown / sessionToJson", () => {
  it("writes markdown with summary and turns", () => {
    const md = sessionToMarkdown(buildSessionExport(items));
    expect(md).toContain("对话回顾");
    expect(md).toContain("你好");
    expect(md).toContain("你好，有什么可以帮忙的");
    expect(md).toContain("用户");
    expect(md).toContain("助手");
  });

  it("round-trips JSON { summary, items }", () => {
    const json = sessionToJson(buildSessionExport(items));
    const parsed = JSON.parse(json) as { summary: string; items: ChatItem[] };
    expect(parsed.summary).toContain("你好");
    expect(parsed.items).toHaveLength(2);
    expect(parseSessionImport(json)).toEqual({
      ok: true,
      value: { summary: parsed.summary, items },
    });
  });
});

describe("parseSessionImport", () => {
  it("rejects invalid JSON and missing items", () => {
    expect(parseSessionImport("not-json").ok).toBe(false);
    expect(parseSessionImport("{}").ok).toBe(false);
    expect(parseSessionImport(JSON.stringify({ summary: "x", items: "no" })).ok).toBe(false);
  });

  it("accepts items-only payloads", () => {
    const result = parseSessionImport(JSON.stringify({ items }));
    expect(result.ok).toBe(true);
    if (result.ok) expect(result.value.items).toEqual(items);
  });
});

describe("viewOnlyItems", () => {
  it("returns a copy suitable for local chat state", () => {
    const imported = viewOnlyItems(items);
    expect(imported).toEqual(items);
    expect(imported).not.toBe(items);
    imported[0] = { kind: "user", id: "mut", text: "x" };
    expect(items[0].id).toBe("u1");
  });
});

describe("exportFilename", () => {
  it("uses a safe stem and the requested extension", () => {
    expect(exportFilename("md", "我的会话")).toBe("我的会话.md");
    expect(exportFilename("json", "a/b:c")).toBe("session.json");
    expect(exportFilename("md")).toBe("session.md");
  });
});
