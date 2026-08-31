import { describe, expect, it } from "vitest";
import type { ChatItem } from "./chat";
import {
  SUMMARY_TURN_THRESHOLD,
  firstUserPreview,
  shouldShowSummary,
  summarizeThread,
} from "./session-summary";

function user(id: string, text: string): ChatItem {
  return { kind: "user", id, text };
}

function assistant(id: string, text: string): ChatItem {
  return { kind: "assistant", id, text };
}

describe("summarizeThread", () => {
  it("joins first user text and last assistant text", () => {
    const items: ChatItem[] = [
      user("u1", "先问一件事"),
      assistant("a1", "先答"),
      user("u2", "再问"),
      assistant("a2", "最后的回答"),
    ];
    expect(summarizeThread(items)).toBe("先问一件事\n最后的回答");
  });

  it("clips each side to 120 characters", () => {
    const first = "问".repeat(200);
    const last = "答".repeat(200);
    const items: ChatItem[] = [
      user("u1", first),
      assistant("a1", "中间"),
      assistant("a2", last),
    ];
    const summary = summarizeThread(items);
    const [left, right] = summary.split("\n");
    expect(left).toBe("问".repeat(120));
    expect(right).toBe("答".repeat(120));
  });

  it("collapses whitespace before clipping", () => {
    expect(summarizeThread([user("u1", "  hello   world  \n")])).toBe("hello world");
  });

  it("returns empty string when there is no user or assistant text", () => {
    expect(summarizeThread([])).toBe("");
    expect(summarizeThread([{ kind: "thought", id: "t", text: "思考" }])).toBe("");
  });
});

describe("shouldShowSummary", () => {
  it("is true only when user+assistant turns exceed 10", () => {
    const ten: ChatItem[] = Array.from({ length: 10 }, (_, i) =>
      i % 2 === 0 ? user(`u${i}`, "q") : assistant(`a${i}`, "a"),
    );
    expect(SUMMARY_TURN_THRESHOLD).toBe(10);
    expect(shouldShowSummary(ten)).toBe(false);
    expect(shouldShowSummary([...ten, user("u10", "more")])).toBe(true);
    expect(shouldShowSummary([...ten, { kind: "thought", id: "t", text: "x" }])).toBe(false);
  });
});

describe("firstUserPreview", () => {
  it("returns the first 40 chars of the first user message", () => {
    expect(firstUserPreview([user("u1", "字".repeat(80))])).toBe("字".repeat(40));
    expect(firstUserPreview([assistant("a1", "no"), user("u1", "  hi  ")])).toBe("hi");
    expect(firstUserPreview([])).toBe("");
  });
});
