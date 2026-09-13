import { describe, expect, it } from "vitest";
import type { ChatItem, ThreadBlock } from "./chat";
import { findThreadHits, findableText, stepFindIndex } from "./thread-find";

const user = (id: string, text: string): ChatItem => ({ kind: "user", id, text });
const assistant = (id: string, text: string): ChatItem => ({ kind: "assistant", id, text });
const tool = (id: string, text: string): ChatItem => ({
  kind: "tool",
  id,
  title: "bash ls",
  status: "completed",
  detail: text,
});

function blocks(items: ChatItem[]): ThreadBlock[] {
  return items.map((item) => ({ kind: "item", item }));
}

describe("findThreadHits", () => {
  it("matches user and assistant items case-insensitively, in order", () => {
    const hits = findThreadHits(
      blocks([
        user("u1", "Hello World"),
        assistant("a1", "worldly reply"),
        user("u2", "nothing here"),
      ]),
      "world",
    );
    expect(hits.map((h) => h.id)).toEqual(["u1", "a1"]);
    expect(hits[0].blockIndex).toBe(0);
    expect(hits[1].blockIndex).toBe(1);
  });

  it("skips tool/thought items and injected user memory", () => {
    const injected = "<user-memory>\nsecret needle\n</user-memory>\n\nreal question";
    const items = blocks([
      tool("t1", "needle in output"),
      { kind: "thought", id: "th", text: "needle thought" },
      user("u1", injected),
      user("u2", "needle for real"),
    ]);
    const hits = findThreadHits(items, "needle");
    expect(hits.map((h) => h.id)).toEqual(["u2"]);
    expect(hits[0].blockIndex).toBe(3);
  });

  it("skips non-item (work) blocks but keeps the row index aligned", () => {
    const list: ThreadBlock[] = [
      { kind: "item", item: user("u1", "first") },
      { kind: "work", id: "w1", items: [] },
      { kind: "item", item: assistant("a1", "first again") },
    ];
    const hits = findThreadHits(list, "first");
    expect(hits).toEqual([
      { id: "u1", blockIndex: 0 },
      { id: "a1", blockIndex: 2 },
    ]);
  });

  it("returns no hits for a blank query", () => {
    expect(findThreadHits(blocks([user("u1", "x")]), "  ")).toEqual([]);
    expect(findThreadHits(blocks([user("u1", "x")]), "")).toEqual([]);
  });
});

describe("findableText", () => {
  it("excludes plan/compact items", () => {
    expect(
      findableText({ kind: "plan", id: "p", entries: [{ content: "needle" }] }),
    ).toBe("");
    expect(
      findableText({ kind: "compact", id: "c", phase: "completed" }),
    ).toBe("");
  });
});

describe("stepFindIndex", () => {
  it("steps forward and back with wrap-around", () => {
    expect(stepFindIndex(0, 1, 3)).toBe(1);
    expect(stepFindIndex(2, 1, 3)).toBe(0);
    expect(stepFindIndex(0, -1, 3)).toBe(2);
  });

  it("lands on the nearest edge when the index is stale", () => {
    expect(stepFindIndex(-1, 1, 4)).toBe(0);
    expect(stepFindIndex(-1, -1, 4)).toBe(3);
    expect(stepFindIndex(9, 1, 4)).toBe(0);
  });

  it("returns -1 when there are no hits", () => {
    expect(stepFindIndex(0, 1, 0)).toBe(-1);
  });
});
