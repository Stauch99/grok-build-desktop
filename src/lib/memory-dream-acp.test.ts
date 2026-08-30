import { describe, expect, it } from "vitest";
import {
  appendDreamsAppendix,
  dreamAssistantDelta,
  loggedInAgentIds,
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
