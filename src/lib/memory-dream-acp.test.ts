import { describe, expect, it } from "vitest";
import {
  appendDreamsAppendix,
  dreamAlreadyRunning,
  dreamAssistantDelta,
  forgetDreamSession,
  isDreamSession,
  loggedInAgentIds,
  rememberDreamAgent,
  rememberDreamSession,
  unwrapFence,
} from "./memory-dream-acp";

describe("unwrapFence", () => {
  it("strips a markdown fence around a file body", () => {
    expect(unwrapFence("```md\n# You\n- hi\n```\n")).toBe("# You\n- hi\n");
    expect(unwrapFence("# You\n- hi\n")).toBe("# You\n- hi\n");
  });
});

describe("appendDreamsAppendix", () => {
  it("appends a ## day section", () => {
    expect(appendDreamsAppendix("## 2026-08-29\nold\n", "## 2026-08-30\nnew")).toBe(
      "## 2026-08-29\nold\n\n## 2026-08-30\nnew\n",
    );
    expect(appendDreamsAppendix("", "## 2026-08-30\nnew")).toBe("## 2026-08-30\nnew\n");
  });
});

describe("dreamAssistantDelta", () => {
  it("keeps agent chunks for the dream session only", () => {
    expect(
      dreamAssistantDelta(
        {
          method: "session/update",
          params: {
            sessionId: "dream-1",
            update: { sessionUpdate: "agent_message_chunk", content: { text: "hello" } },
          },
        },
        "dream-1",
      ),
    ).toBe("hello");
    expect(
      dreamAssistantDelta(
        {
          method: "session/update",
          params: {
            sessionId: "chat",
            update: { sessionUpdate: "agent_message_chunk", content: { text: "nope" } },
          },
        },
        "dream-1",
      ),
    ).toBeNull();
  });
});

describe("loggedInAgentIds", () => {
  it("keeps doctors with authPresent", () => {
    expect(
      loggedInAgentIds([
        { agentId: "grok", authPresent: true },
        { agentId: "claude", authPresent: false },
        { agentId: "kimi", authPresent: true },
      ]),
    ).toEqual(["grok", "kimi"]);
  });
});

describe("isDreamSession", () => {
  it("remembers and forgets a dream sid", () => {
    expect(isDreamSession("dream-sid")).toBe(false);
    rememberDreamSession("dream-sid");
    expect(isDreamSession("dream-sid")).toBe(true);
    expect(isDreamSession("live-sid")).toBe(false);
    expect(isDreamSession(null)).toBe(false);
    forgetDreamSession("dream-sid");
    expect(isDreamSession("dream-sid")).toBe(false);
  });
});

describe("dreamAlreadyRunning", () => {
  it("is true when selected matches or that CLI was already started", () => {
    expect(dreamAlreadyRunning("grok", "kimi")).toBe(false);
    expect(dreamAlreadyRunning("kimi", "kimi")).toBe(true);
    rememberDreamAgent("claude");
    expect(dreamAlreadyRunning("grok", "claude")).toBe(true);
  });
});
