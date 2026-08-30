import { describe, expect, it } from "vitest";
import type { AcpRecord } from "./acp-events";
import { forgetDreamSession, rememberDreamSession } from "./memory-dream-acp";
import { emptyMemoryState } from "./memory-state";
import {
  applyGrokIngest,
  finishLightAfterPrompt,
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

describe("finishLightAfterPrompt", () => {
  it("does not assign cursors when the light prompt rejects", async () => {
    const live = blankIo();
    const { io: ingested } = applyGrokIngest(
      live,
      [{ sessionId: "s1", cwd: "/proj", rows: fixture, nextByte: 420 }],
      "2026-08-30",
    );
    await expect(finishLightAfterPrompt(live, ingested, Promise.reject(new Error("down")))).rejects.toThrow("down");
    expect(live.state.cursors).toEqual({});
  });

  it("assigns cursors only after prompt and keeps ingest daily when parse is empty", async () => {
    const live = blankIo();
    const { io: ingested } = applyGrokIngest(
      live,
      [{ sessionId: "s1", cwd: "/proj", rows: fixture, nextByte: 420 }],
      "2026-08-30",
    );
    const out = await finishLightAfterPrompt(live, ingested, Promise.resolve("sorry, prose only"));
    expect(live.state.cursors["grok/s1"]).toBe(420);
    expect(out.dailyMd).toBe(ingested.dailyMd);
    expect(out.dailyMd).toContain("I like dark mode");
  });
});
