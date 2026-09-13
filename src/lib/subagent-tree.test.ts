import { describe, expect, it } from "vitest";
import type { SessionSummary } from "../api";
import type { ChatItem } from "./chat";
import { liveRosterId } from "./live-roster";
import { resolveSubagentSession, subagentChips } from "./subagent-tree";

function session(partial: Partial<SessionSummary> & Pick<SessionSummary, "id">): SessionSummary {
  return {
    cwd: "/work",
    title: partial.id,
    updatedAt: "2026-08-31T00:00:00.000Z",
    createdAt: "2026-08-31T00:00:00.000Z",
    numMessages: 1,
    ...partial,
  };
}

describe("resolveSubagentSession", () => {
  it("opens the disk child whose toolUseId matches the tool call", () => {
    const child = session({
      id: "ab4a5fb3123330325",
      parentSessionId: "parent",
      sessionKind: "subagent",
      toolUseId: "toolu_4b5cb057c47b48d2a5c0a742",
      title: "Grok 近期动态爆点调研",
      agentId: "claude",
    });
    const found = resolveSubagentSession("toolu_4b5cb057c47b48d2a5c0a742", [session({ id: "parent" }), child], {
      parentSessionId: "parent",
      agentId: "claude",
    });
    expect(found?.id).toBe(child.id);
  });

  it("does not fall back to a live row when a disk child exists", () => {
    const live = session({
      id: liveRosterId("claude", "toolu_1"),
      parentSessionId: "parent",
      sessionKind: "subagent",
      title: "Agent",
      agentId: "claude",
    });
    const disk = session({
      id: "child-disk",
      parentSessionId: "parent",
      sessionKind: "subagent",
      toolUseId: "toolu_1",
      title: "Token 价值算账调研",
      agentId: "claude",
    });
    const found = resolveSubagentSession("toolu_1", [live, disk], {
      parentSessionId: "parent",
      agentId: "claude",
    });
    expect(found?.id).toBe("child-disk");
  });

  it("opens a Grok disk child by subagent_id in the tool detail", () => {
    const child = session({
      id: "01a078d3-8771-7443-aa04-05c384fd1de9",
      parentSessionId: "parent",
      sessionKind: "subagent",
      title: "CS329A Lectures 6–7 HTML Pages",
      agentId: "grok",
    });
    const found = resolveSubagentSession(
      "spawn",
      [session({ id: "parent" }), child],
      { parentSessionId: "parent", agentId: "grok" },
      "Subagent started in background.\nsubagent_id: 01a078d3-8771-7443-aa04-05c384fd1de9",
    );
    expect(found?.id).toBe(child.id);
  });

  it("returns null when nothing matches", () => {
    expect(
      resolveSubagentSession("missing", [session({ id: "parent" })], {
        parentSessionId: "parent",
        agentId: "claude",
      }),
    ).toBeNull();
  });
});

describe("subagentChips", () => {
  it("uses the nested session title and marks the chip openable", () => {
    const items: ChatItem[] = [
      { kind: "tool", id: "toolu_1", title: "Agent", status: "completed" },
      { kind: "tool", id: "toolu_2", title: "Agent", status: "completed" },
    ];
    const chips = subagentChips(items, [
      session({
        id: "c1",
        parentSessionId: "parent",
        sessionKind: "subagent",
        toolUseId: "toolu_1",
        title: "Grok 近期动态爆点调研",
      }),
      session({
        id: "c2",
        parentSessionId: "parent",
        sessionKind: "subagent",
        toolUseId: "toolu_2",
        title: "Token 价值算账调研",
      }),
    ], { parentSessionId: "parent", agentId: "claude" });
    expect(chips.map((c) => ({ name: c.name, sessionId: c.sessionId }))).toEqual([
      { name: "Grok 近期动态爆点调研", sessionId: "c1" },
      { name: "Token 价值算账调研", sessionId: "c2" },
    ]);
  });

  it("does not mark live-only rows as openable", () => {
    const chips = subagentChips(
      [{ kind: "tool", id: "toolu_1", title: "Agent", status: "in_progress" }],
      [
        session({
          id: liveRosterId("claude", "toolu_1"),
          parentSessionId: "parent",
          sessionKind: "subagent",
          title: "Agent",
        }),
      ],
      { parentSessionId: "parent", agentId: "claude" },
    );
    expect(chips).toEqual([
      { id: "toolu_1", name: "Agent", status: "running", sessionId: null },
    ]);
  });

  it("marks a Grok child openable from spawn detail even without toolUseId", () => {
    const chips = subagentChips(
      [
        {
          kind: "tool",
          id: "spawn",
          title: "spawn_subagent writer",
          status: "completed",
          detail: "subagent_id: child-1",
        },
      ],
      [
        session({
          id: "child-1",
          parentSessionId: "parent",
          sessionKind: "subagent",
          title: "Write lectures 6 and 7",
          agentId: "grok",
        }),
      ],
      { parentSessionId: "parent", agentId: "grok" },
    );
    expect(chips).toEqual([
      {
        id: "spawn",
        name: "Write lectures 6 and 7",
        status: "completed",
        sessionId: "child-1",
      },
    ]);
  });

  it("keeps one chip per independent child session", () => {
    const chips = subagentChips(
      [
        { kind: "tool", id: "spawn", title: "spawn_subagent writer", status: "completed" },
        { kind: "tool", id: "again", title: "spawn_subagent writer", status: "completed" },
      ],
      [
        session({
          id: "child-1",
          parentSessionId: "parent",
          sessionKind: "subagent",
          toolUseId: "spawn",
          title: "[subagent:general-purpose] writer (child-1)",
        }),
        session({
          id: "child-1",
          parentSessionId: "parent",
          sessionKind: "subagent",
          toolUseId: "again",
          title: "[subagent:general-purpose] writer (child-1)",
        }),
      ],
      { parentSessionId: "parent", agentId: "grok" },
    );
    expect(chips).toEqual([
      {
        id: "spawn",
        name: "[subagent:general-purpose] writer (child-1)",
        status: "completed",
        sessionId: "child-1",
      },
    ]);
  });
});
