import { describe, expect, it } from "vitest";
import { filterIngestTurns, formatDailyFile, looksLikeSecret, parseDailyFile, utf8Bytes } from "./memory-ingest";
import { DREAM_LINE_MAX_CHARS } from "./memory-weight";

describe("looksLikeSecret", () => {
  it("flags key-shaped strings", () => {
    expect(looksLikeSecret("sk-abc")).toBe(true);
    expect(looksLikeSecret("hello")).toBe(false);
  });
});

describe("filterIngestTurns", () => {
  it("keeps user talk and commitments, drops tools and forgotten", () => {
    const lines = filterIngestTurns(
      [
        { agentId: "grok", sessionId: "s1", cwd: "/p", role: "user", text: "use vitest" },
        { agentId: "claude", sessionId: "s2", cwd: "/p", role: "assistant", text: "I will use vitest", kind: "agent_commitment" },
        { agentId: "grok", sessionId: "s1", cwd: "/p", role: "tool", text: "ls" },
        { agentId: "grok", sessionId: "gone", cwd: "/p", role: "user", text: "old" },
        { agentId: "grok", sessionId: "s1", cwd: "/p", role: "user", text: "sk-secret" },
      ],
      ["gone"],
    );
    expect(lines.map((l) => l.text)).toEqual(["use vitest", "I will use vitest"]);
    expect(lines[1]?.agentId).toBe("claude");
  });
});

describe("daily file", () => {
  it("round-trips tagged lines", () => {
    const lines = filterIngestTurns(
      [{ agentId: "grok", sessionId: "s1", cwd: "/p", role: "user", text: "use vitest" }],
      [],
    );
    const text = formatDailyFile("2026-08-30", lines);
    expect(parseDailyFile(text)).toEqual(lines);
  });

  it("parseDailyFile is empty for untagged model prose", () => {
    expect(parseDailyFile("# 2026-08-30\njust a summary of the day\n")).toEqual([]);
  });

  it("clips a long utterance to DREAM_LINE_MAX_CHARS", () => {
    const text = "x".repeat(20_000);
    const lines = [{ agentId: "grok" as const, sessionId: "s1", cwd: "/p", kind: "user_utterance" as const, text }];
    const file = formatDailyFile("2026-09-08", lines);
    expect(file).toContain("x".repeat(DREAM_LINE_MAX_CHARS));
    expect(file).not.toContain("x".repeat(DREAM_LINE_MAX_CHARS + 1));
  });
});

describe("utf8Bytes", () => {
  it("utf8Bytes counts CJK as three bytes each", () => {
    expect(utf8Bytes("中")).toBe(3);
  });
});

describe("teach_episode", () => {
  it("round-trips teach_episode lines", () => {
    const lines = [
      {
        agentId: "grok" as const,
        sessionId: "s1",
        cwd: "/p",
        kind: "teach_episode" as const,
        text: "was: A → now: B",
      },
    ];
    expect(parseDailyFile(formatDailyFile("2026-09-09", lines))).toEqual(lines);
  });
});
