import { describe, expect, it } from "vitest";
import { filterIngestTurns, formatDailyFile, looksLikeSecret, parseDailyFile } from "./memory-ingest";

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
});
