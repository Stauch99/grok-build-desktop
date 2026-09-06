import { describe, expect, it } from "vitest";
import type { WorkItem } from "./chat";
import {
  LIVE_PHRASE_TICKS,
  visibleWorkItems,
  workRunCopy,
  workRunKeywords,
} from "./work-run";
import { WORK_RUN_IDLE, WORK_RUN_VERBS } from "./work-run-copy";

function tool(
  id: string,
  title: string,
  extra: Partial<Extract<WorkItem, { kind: "tool" }>> = {},
): Extract<WorkItem, { kind: "tool" }> {
  return { kind: "tool", id, title, status: "completed", ...extra };
}

function thought(id: string, text = "hmm", extra: Partial<Extract<WorkItem, { kind: "thought" }>> = {}): WorkItem {
  return { kind: "thought", id, text, ...extra };
}

describe("workRunKeywords", () => {
  it("takes basenames and first command tokens from completed tools", () => {
    expect(
      workRunKeywords([
        tool("1", "Read src/lib/chat.ts", { toolKind: "read" }),
        tool("2", "Bash: git status", { toolKind: "execute" }),
        tool("3", "Edit src/App.tsx", { toolKind: "edit" }),
      ]),
    ).toEqual(["chat.ts", "git", "App.tsx"]);
  });

  it("merges adjacent duplicates and skips in-progress tools", () => {
    expect(
      workRunKeywords([
        tool("1", "Read a.ts", { toolKind: "read" }),
        tool("2", "Read src/a.ts", { toolKind: "read" }),
        tool("3", "Read b.ts", { toolKind: "read", status: "in_progress" }),
      ]),
    ).toEqual(["a.ts"]);
  });

  it("caps at four keywords and about 36 characters", () => {
    const words = workRunKeywords([
      tool("1", "Read 学生编号", { toolKind: "read" }),
      tool("2", "Read 记录ID", { toolKind: "read" }),
      tool("3", "Write 字段写入与回读", { toolKind: "write" }),
      tool("4", "Read extra-long-filename-should-not-all-fit.ts", { toolKind: "read" }),
      tool("5", "Read leftover.ts", { toolKind: "read" }),
    ]);
    expect(words.length).toBeLessThanOrEqual(4);
    expect(words.join("、").length).toBeLessThanOrEqual(36);
  });
});

describe("workRunCopy settled", () => {
  it("joins count and keywords", () => {
    const items = [
      thought("t"),
      tool("1", "Read src/lib/chat.ts", { toolKind: "read" }),
      tool("2", "Edit src/App.tsx", { toolKind: "edit" }),
    ];
    const copy = workRunCopy({ items, locale: "zh" });
    expect(copy.text).toBe("使用 2 个工具，操作结果：chat.ts、App.tsx");
    expect(copy.ariaLabel).toBe("使用 2 个工具，操作结果：chat.ts、App.tsx");
    expect(copy.failed).toBe(0);
  });

  it("falls back to count when nothing useful remains", () => {
    const copy = workRunCopy({
      items: [tool("1", "Read", { toolKind: "read" }), tool("2", "Read", { toolKind: "read" })],
      locale: "zh",
    });
    expect(copy.text).toBe("使用 2 个工具");
  });

  it("appends failure count without opening", () => {
    const copy = workRunCopy({
      items: [
        tool("1", "Read a.ts", { toolKind: "read" }),
        tool("2", "Read b.ts", { toolKind: "read", status: "failed" }),
      ],
      locale: "zh",
    });
    expect(copy.text).toBe("使用 2 个工具，操作结果：a.ts、b.ts · 1 个失败");
    expect(copy.failed).toBe(1);
  });

  it("labels a thought-only run, with duration when long enough", () => {
    expect(workRunCopy({ items: [thought("t")], locale: "zh" }).text).toBe("思考了");
    expect(
      workRunCopy({
        items: [thought("t", "hmm", { at: 0, until: 12_000 })],
        locale: "zh",
      }).text,
    ).toBe("思考了 12秒");
  });

  it("uses English settled templates", () => {
    const copy = workRunCopy({
      items: [tool("1", "Read src/a.ts", { toolKind: "read" })],
      locale: "en",
    });
    expect(copy.text).toBe("Used 1 tool, results: a.ts");
  });
});

describe("workRunCopy live", () => {
  it("keeps the tool detail and picks a playful verb from the locale list", () => {
    const items = [tool("1", "Read package.json", { toolKind: "read", status: "in_progress" })];
    const copy = workRunCopy({ items, busy: true, runId: "work-1", tick: 0, locale: "zh" });
    expect(copy.text).toMatch(/ · package\.json$/);
    expect(copy.text.startsWith("正在")).toBe(false);
    expect(copy.ariaLabel).toBe("正在读取 package.json");
  });

  it("keeps the failure count on the live line", () => {
    const copy = workRunCopy({
      items: [
        tool("1", "Read a.ts", { toolKind: "read", status: "failed" }),
        tool("2", "Read b.ts", { toolKind: "read", status: "in_progress" }),
      ],
      busy: true,
      runId: "work-1",
      tick: 0,
      locale: "zh",
    });
    expect(copy.text).toMatch(/ · b\.ts · 1 个失败$/);
    expect(copy.ariaLabel).toBe("正在读取 b.ts · 1 个失败");
    expect(copy.failed).toBe(1);
  });

  it("is stable for the same run and tick, and changes after the phrase interval", () => {
    const items = [thought("t", "…")];
    const a = workRunCopy({ items, busy: true, runId: "work-9", tick: 0, locale: "zh" });
    const b = workRunCopy({ items, busy: true, runId: "work-9", tick: 0, locale: "zh" });
    const c = workRunCopy({ items, busy: true, runId: "work-9", tick: LIVE_PHRASE_TICKS, locale: "zh" });
    expect(a.text).toBe(b.text);
    expect(c.text).not.toBe(a.text);
    expect(a.ariaLabel).toBe("思考中");
  });
});

describe("visibleWorkItems", () => {
  it("drops thoughts when thinking is hidden, and then a thought-only run is empty", () => {
    const items = [thought("t"), tool("1", "Read a.ts", { toolKind: "read" })];
    expect(visibleWorkItems(items, false).map((i) => i.id)).toEqual(["1"]);
    expect(visibleWorkItems([thought("t")], false)).toEqual([]);
  });
});

describe("work-run copy lists", () => {
  it("keeps zh/en phrase lists the same length so rotation stays aligned", () => {
    expect(WORK_RUN_VERBS.zh).toHaveLength(WORK_RUN_VERBS.en.length);
    expect(WORK_RUN_IDLE.zh).toHaveLength(WORK_RUN_IDLE.en.length);
    expect(WORK_RUN_VERBS.zh.length).toBeGreaterThanOrEqual(24);
    expect(WORK_RUN_IDLE.zh.length).toBeGreaterThanOrEqual(24);
  });
});
