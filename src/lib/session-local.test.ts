import { describe, expect, it } from "vitest";
import { exportTranscript, formatSessionInfo, lastAssistantText } from "./session-local";

describe("session local actions", () => {
  it("formats session-info", () => {
    const text = formatSessionInfo({
      id: "abc",
      cwd: "/work",
      model: "grok-4.6",
      title: "Fix",
      turns: 3,
      usage: { used: 10, size: 100 },
    });
    expect(text).toContain("id abc");
    expect(text).toContain("10/100");
  });

  it("exports and copies the last assistant turn", () => {
    const items = [
      { kind: "user", text: "hi" },
      { kind: "assistant", text: "hello" },
      { kind: "tool", title: "read" },
    ];
    expect(exportTranscript(items)).toContain("## User");
    expect(lastAssistantText(items)).toBe("hello");
  });
});
