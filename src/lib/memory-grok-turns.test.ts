import { describe, expect, it } from "vitest";
import type { AcpRecord } from "./acp-events";
import { emptyMemoryState } from "./memory-state";
import { applyGrokIngest, grokTurnsFromUpdates } from "./memory-grok-turns";

const meta = { agentId: "grok" as const, sessionId: "s1", cwd: "/proj" };

const fixture: AcpRecord[] = [
  { update: { sessionUpdate: "user_message_chunk", content: { text: "I like dark mode" } } },
  { update: { sessionUpdate: "agent_message_chunk", content: { text: "Noted." } } },
  { update: { sessionUpdate: "tool_call", toolCallId: "t1", title: "read" } },
  {
    params: {
      update: { sessionUpdate: "user_message_chunk", content: { text: "also rust" } },
    },
  },
];

describe("grokTurnsFromUpdates", () => {
  it("maps user chunk, assistant chunk, and tool event to roles", () => {
    const turns = grokTurnsFromUpdates(fixture, meta);
    expect(turns.map((t) => t.role)).toEqual(["user", "assistant", "tool", "user"]);
    expect(turns[0]).toMatchObject({ text: "I like dark mode", sessionId: "s1", cwd: "/proj", agentId: "grok" });
    expect(turns[1]?.text).toBe("Noted.");
    expect(turns[2]?.role).toBe("tool");
    expect(turns[3]?.text).toBe("also rust");
  });
});

describe("applyGrokIngest", () => {
  it("appends filtered lines and advances cursors", () => {
    const { io, newSessionCount } = applyGrokIngest(
      {
        userMd: "",
        dreamsMd: "",
        dailyMd: "",
        state: emptyMemoryState(),
      },
      [{ sessionId: "s1", cwd: "/proj", rows: fixture, nextByte: 420 }],
      "2026-08-30",
    );
    expect(newSessionCount).toBe(1);
    expect(io.state.cursors["grok/s1"]).toBe(420);
    expect(io.dailyMd).toContain("I like dark mode");
    expect(io.dailyMd).toContain("also rust");
    expect(io.dailyMd).not.toContain("Noted.");
  });

  it("skips forgotten sessions and still counts only new ingest", () => {
    const { io, newSessionCount } = applyGrokIngest(
      {
        userMd: "",
        dreamsMd: "",
        dailyMd: "",
        state: { ...emptyMemoryState(), forgotten: ["gone"] },
      },
      [
        { sessionId: "gone", cwd: "/p", rows: fixture, nextByte: 9 },
        { sessionId: "s2", cwd: "/p", rows: [], nextByte: 3 },
      ],
      "2026-08-30",
    );
    expect(newSessionCount).toBe(0);
    expect(io.state.cursors["grok/gone"]).toBeUndefined();
    expect(io.state.cursors["grok/s2"]).toBe(3);
  });
});
