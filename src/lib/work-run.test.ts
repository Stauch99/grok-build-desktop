import { describe, expect, it } from "vitest";
import type { ThreadBlock, WorkItem } from "./chat";
import {
  LIVE_PHRASE_TICKS,
  formatLiveElapsed,
  formatWorkedElapsed,
  liveTool,
  liveWorkBlockId,
  visibleWorkItems,
  workRunCopy,
  workRunIsLive,
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

  it("ignores Claude workflow tools like TaskUpdate in the settled summary", () => {
    const copy = workRunCopy({
      items: [
        tool("1", "TaskUpdate"),
        tool("2", "TaskUpdate"),
        tool("3", "Bash: ls", { toolKind: "execute" }),
      ],
      locale: "zh",
    });
    expect(copy.text).toBe("使用 1 个工具，操作结果：ls");
    expect(copy.text).not.toContain("TaskUpdate");
  });

  it("does not headline an in-flight TaskUpdate as the live tool", () => {
    const copy = workRunCopy({
      items: [
        tool("1", "TaskUpdate", { status: "in_progress" }),
        thought("t", "下一步"),
      ],
      busy: true,
      runId: "work-1",
      tick: 0,
      locale: "zh",
    });
    expect(copy.text).not.toContain("TaskUpdate");
    expect(copy.ariaLabel).toBe("思考中");
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

describe("workRunIsLive", () => {
  it("stays live while the current turn is busy, even after tools settle", () => {
    expect(
      workRunIsLive({
        items: [tool("1", "Read a.ts", { toolKind: "read" })],
        busy: true,
      }),
    ).toBe(true);
  });

  it("settles when the pane is idle, even if a poll or spawn tool never completed", () => {
    expect(
      workRunIsLive({
        items: [tool("1", "Read a.ts", { toolKind: "read", status: "in_progress" })],
        busy: false,
      }),
    ).toBe(false);
    expect(
      workRunIsLive({
        items: [tool("1", "Get task output: 01abc", { status: "in_progress" })],
        busy: false,
      }),
    ).toBe(false);
  });

  it("settles when the turn is idle and every tool has finished", () => {
    expect(
      workRunIsLive({
        items: [tool("1", "Read a.ts", { toolKind: "read" })],
        busy: false,
      }),
    ).toBe(false);
  });
});

describe("liveWorkBlockId", () => {
  it("keeps the current turn's work cluster live after assistant text starts", () => {
    const blocks: ThreadBlock[] = [
      { kind: "item", item: { kind: "user", id: "u", text: "go" } },
      {
        kind: "work",
        id: "work-k1",
        items: [tool("k1", "Read a.ts", { toolKind: "read" })],
      },
      { kind: "item", item: { kind: "assistant", id: "a", text: "ok" } },
    ];
    expect(liveWorkBlockId(blocks, { busy: true, showThinking: true })).toBe("work-k1");
  });

  it("does not light up a previous turn after a new user message", () => {
    const blocks: ThreadBlock[] = [
      { kind: "item", item: { kind: "user", id: "u1", text: "go" } },
      {
        kind: "work",
        id: "work-old",
        items: [tool("k1", "Read a.ts", { toolKind: "read" })],
      },
      { kind: "item", item: { kind: "assistant", id: "a", text: "ok" } },
      { kind: "item", item: { kind: "user", id: "u2", text: "again" } },
    ];
    expect(liveWorkBlockId(blocks, { busy: true, showThinking: true })).toBeNull();
  });

  it("does not keep a finished turn's work cluster live after busy clears", () => {
    const blocks: ThreadBlock[] = [
      { kind: "item", item: { kind: "user", id: "u", text: "go" } },
      {
        kind: "work",
        id: "work-k1",
        items: [tool("k1", "Get task output: 01abc", { status: "in_progress" })],
      },
      { kind: "item", item: { kind: "assistant", id: "a", text: "ok" } },
    ];
    expect(liveWorkBlockId(blocks, { busy: false, showThinking: true })).toBeNull();
  });
});

describe("formatLiveElapsed", () => {
  it("uses tenths of a second in mono-friendly units", () => {
    expect(formatLiveElapsed(12_500)).toBe("12.5s");
    expect(formatLiveElapsed(65_200)).toBe("1m 5.2s");
  });
});

describe("formatWorkedElapsed", () => {
  it("uses whole seconds like Working for 4m 4s", () => {
    expect(formatWorkedElapsed(12_500)).toBe("12s");
    expect(formatWorkedElapsed(244_000)).toBe("4m 4s");
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

describe("liveTool", () => {
  it("returns the newest in-flight tool and skips workflow titles", () => {
    expect(
      liveTool([
        tool("1", "Read a.ts", { toolKind: "read", status: "completed" }),
        tool("2", "Edit b.ts", { toolKind: "edit", status: "in_progress" }),
      ])?.id,
    ).toBe("2");
    expect(liveTool([tool("1", "Read a.ts", { toolKind: "read" })])).toBeUndefined();
  });

  it("does not treat a Get task output poll as the live tool", () => {
    expect(
      liveTool([
        tool("1", "Read a.ts", { toolKind: "read", status: "completed" }),
        tool("2", "Get task output: 01abc", { status: "in_progress" }),
      ]),
    ).toBeUndefined();
  });
});
