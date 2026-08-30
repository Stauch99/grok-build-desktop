import { describe, expect, it } from "vitest";
import { emptyMemoryState } from "./memory-state";
import { corpusLine, overlayStatus, parseDreamsMd, selectedDiary } from "./memory-view";

describe("parseDreamsMd", () => {
  it("reads dated entries newest-last in file order", () => {
    const entries = parseDreamsMd("## 2026-08-29\nold\n\n## 2026-08-30\nnew\n");
    expect(entries).toEqual([
      { date: "2026-08-29", body: "old" },
      { date: "2026-08-30", body: "new" },
    ]);
  });
});

describe("selectedDiary", () => {
  const entries = [
    { date: "2026-08-29", body: "old" },
    { date: "2026-08-30", body: "new" },
  ];

  it("defaults to entries.at(-1) when date is null or missing", () => {
    expect(selectedDiary(entries, null)).toEqual(entries.at(-1));
    expect(selectedDiary(entries, "2026-01-01")).toEqual(entries.at(-1));
    expect(selectedDiary([], null)).toBe(null);
  });

  it("returns the matching date when present", () => {
    expect(selectedDiary(entries, "2026-08-29")).toEqual(entries[0]);
  });
});

describe("corpusLine", () => {
  it("lists only agents that spoke", () => {
    expect(corpusLine([
      { agentId: "grok", sessionId: "a", cwd: "/p", kind: "user_utterance", text: "1" },
      { agentId: "grok", sessionId: "b", cwd: "/p", kind: "user_utterance", text: "2" },
      { agentId: "claude", sessionId: "c", cwd: "/p", kind: "user_utterance", text: "3" },
    ])).toBe("今日语料：Grok 2 · Claude 1");
    expect(corpusLine([])).toBe(null);
  });
});

describe("overlayStatus", () => {
  it("prefers running then login then failed", () => {
    expect(overlayStatus({ ...emptyMemoryState(), lastStatus: "running" }, 0)).toEqual({ kind: "running" });
    expect(overlayStatus({ ...emptyMemoryState(), lastStatus: "blocked-login", lastDreamAgentId: "grok" }, 0)).toEqual({
      kind: "blocked-login",
      agentId: "grok",
    });
    expect(overlayStatus({ ...emptyMemoryState(), lastStatus: "failed" }, 0)).toEqual({ kind: "failed" });
    expect(overlayStatus(emptyMemoryState(), 3)).toEqual({ kind: "pending", sessionCount: 3 });
  });
});
