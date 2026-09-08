import { describe, expect, it } from "vitest";
import type { AcpRecord } from "./acp-events";
import { forgetDreamSession, rememberDreamSession } from "./memory-dream-acp";
import { clipDailyText, MEMORY_FILE_MAX_BYTES, utf8Bytes } from "./memory-ingest";
import { DAILY_MAX_SHARDS } from "./memory-paths";
import { emptyMemoryState } from "./memory-state";
import { DREAM_LINE_MAX_CHARS } from "./memory-weight";
import {
  applyGrokIngest,
  grokTurnsFromUpdates,
  skipDreamIngestPage,
} from "./memory-grok-turns";

const meta = { agentId: "grok" as const, sessionId: "s1", cwd: "/proj" };

function blankIo() {
  return {
    userMd: "",
    dreamsMd: "",
    dailyMd: "",
    state: emptyMemoryState(),
  };
}

function userChunk(text: string): AcpRecord {
  return { update: { sessionUpdate: "user_message_chunk", content: { text } } };
}

function dailyLine(sessionId: string, cwd: string, text: string): string {
  return `- [grok | ${sessionId} | ${cwd} | user_utterance] ${clipDailyText(text)}\n`;
}

function packUntilCap(start: string, line: string): { body: string; lines: number } {
  let body = start;
  let lines = 0;
  while (utf8Bytes(body + line) <= MEMORY_FILE_MAX_BYTES) {
    body += line;
    lines += 1;
  }
  return { body, lines };
}

function userPage(sessionId: string, cwd: string, texts: string[], nextByte: number) {
  return { sessionId, cwd, rows: texts.map(userChunk), nextByte };
}

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

  it("drops harness user chunks so they are not ingested as preferences", () => {
    const turns = grokTurnsFromUpdates(
      [
        { update: { sessionUpdate: "user_message_chunk", content: { text: "<system-reminder>\nskip" } } },
        { update: { sessionUpdate: "user_message_chunk", content: { text: "I like dark mode" } } },
      ],
      meta,
    );
    expect(turns.map((t) => t.text)).toEqual(["I like dark mode"]);
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

  it("does not mutate the input cursor map", () => {
    const live = blankIo();
    applyGrokIngest(live, [{ sessionId: "s1", cwd: "/proj", rows: fixture, nextByte: 420 }], "2026-08-30");
    expect(live.state.cursors).toEqual({});
  });

  it("skips pages whose cwd is the memory root or whose sid is a dream session", () => {
    rememberDreamSession("dream-sid");
    const { io, newSessionCount } = applyGrokIngest(
      blankIo(),
      [
        { sessionId: "dream-cwd", cwd: "/wb/memory", rows: fixture, nextByte: 11 },
        { sessionId: "dream-sid", cwd: "/proj", rows: fixture, nextByte: 22 },
        { sessionId: "s1", cwd: "/proj", rows: fixture, nextByte: 420 },
      ],
      "2026-08-30",
      "/wb/memory",
    );
    forgetDreamSession("dream-sid");
    expect(newSessionCount).toBe(1);
    expect(io.state.cursors["grok/dream-cwd"]).toBeUndefined();
    expect(io.state.cursors["grok/dream-sid"]).toBeUndefined();
    expect(io.state.cursors["grok/s1"]).toBe(420);
    expect(io.dailyMd).toContain("I like dark mode");
  });

  it("fills shard 1 then shard 2 before advancing a later session cursor", () => {
    const day = "2026-09-08";
    const cwd = "/p";
    const chunk = "x".repeat(DREAM_LINE_MAX_CHARS);
    const header = `# ${day}\n`;
    const nA = packUntilCap(header, dailyLine("a", cwd, chunk)).lines;
    const { io, shards, stoppedEarly, newSessionCount } = applyGrokIngest(
      blankIo(),
      [
        userPage("a", cwd, Array.from({ length: nA }, () => chunk), 100),
        userPage("b", cwd, [chunk], 200),
      ],
      day,
    );
    expect(io.state.cursors["grok/a"]).toBe(100);
    expect(io.state.cursors["grok/b"]).toBe(200);
    expect(stoppedEarly).toBe(false);
    expect(newSessionCount).toBe(2);
    expect(io.dailyMd).toBe(shards[1]);
    expect(utf8Bytes(shards[1])).toBeLessThanOrEqual(MEMORY_FILE_MAX_BYTES);
    expect(utf8Bytes(shards[2])).toBeLessThanOrEqual(MEMORY_FILE_MAX_BYTES);
    expect(shards[1]).toContain("- [grok | a |");
    expect(shards[1]).not.toContain("- [grok | b |");
    expect(shards[2]).toContain("- [grok | b |");
  });

  it("leaves a session cursor unchanged when all shards are full", () => {
    const day = "2026-09-08";
    const cwd = "/p";
    const chunk = "x".repeat(DREAM_LINE_MAX_CHARS);
    const header = `# ${day}\n`;
    const filled = packUntilCap(header, dailyLine("s1", cwd, chunk));
    const perShard = packUntilCap(header, dailyLine("s2", cwd, chunk)).lines;
    const pages = [];
    for (let i = 2; i <= DAILY_MAX_SHARDS; i++) {
      pages.push(userPage(`s${i}`, cwd, Array.from({ length: perShard }, () => chunk), i * 10));
    }
    pages.push(userPage("late", cwd, [chunk], 50));
    const { io, shards, stoppedEarly } = applyGrokIngest(
      {
        ...blankIo(),
        dailyMd: filled.body,
        state: { ...emptyMemoryState(), cursors: { "grok/late": 3 } },
      },
      pages,
      day,
    );
    expect(io.state.cursors["grok/late"]).toBe(3);
    expect(stoppedEarly).toBe(true);
    expect(io.dailyMd).toBe(shards[1]);
    expect(Object.keys(shards)).toHaveLength(DAILY_MAX_SHARDS);
    for (const body of Object.values(shards)) {
      expect(utf8Bytes(body)).toBeLessThanOrEqual(MEMORY_FILE_MAX_BYTES);
      expect(body).not.toContain("- [grok | late |");
    }
  });
});

describe("skipDreamIngestPage", () => {
  it("skips memoryRoot cwd and a remembered dream sid", () => {
    rememberDreamSession("dream-sid");
    expect(skipDreamIngestPage({ sessionId: "chat", cwd: "/wb/memory" }, "/wb/memory")).toBe(true);
    expect(skipDreamIngestPage({ sessionId: "dream-sid", cwd: "/proj" }, "/wb/memory")).toBe(true);
    expect(skipDreamIngestPage({ sessionId: "chat", cwd: "/proj" }, "/wb/memory")).toBe(false);
    forgetDreamSession("dream-sid");
  });
});
