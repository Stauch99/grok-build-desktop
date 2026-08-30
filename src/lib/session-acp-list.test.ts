import { describe, expect, it, vi } from "vitest";
import type { SessionSummary } from "../api";
import {
  mapAcpListedSessions,
  maybeFetchAcpSessionList,
  sessionListAdvertised,
  unionSessionsById,
} from "./session-acp-list";

function row(partial: Partial<SessionSummary> & Pick<SessionSummary, "id">): SessionSummary {
  return {
    cwd: "/work",
    title: partial.id,
    updatedAt: "2026-08-01T00:00:00.000Z",
    createdAt: "2026-08-01T00:00:00.000Z",
    numMessages: 1,
    ...partial,
  };
}

describe("sessionListAdvertised", () => {
  it("is true when list is an object or true", () => {
    expect(
      sessionListAdvertised({
        agentCapabilities: { sessionCapabilities: { list: {} } },
      }),
    ).toBe(true);
    expect(
      sessionListAdvertised({
        agentCapabilities: { sessionCapabilities: { list: true } },
      }),
    ).toBe(true);
  });

  it("is false when list is missing or not advertised", () => {
    expect(sessionListAdvertised(null)).toBe(false);
    expect(sessionListAdvertised({})).toBe(false);
    expect(sessionListAdvertised({ agentCapabilities: {} })).toBe(false);
    expect(sessionListAdvertised({ agentCapabilities: { sessionCapabilities: {} } })).toBe(false);
    expect(
      sessionListAdvertised({
        agentCapabilities: { sessionCapabilities: { list: false } },
      }),
    ).toBe(false);
    expect(
      sessionListAdvertised({
        agentCapabilities: { loadSession: true, sessionCapabilities: { resume: {} } },
      }),
    ).toBe(false);
  });
});

describe("mapAcpListedSessions", () => {
  it("maps sessions[] and stamps agentId", () => {
    const rows = mapAcpListedSessions(
      {
        sessions: [
          {
            sessionId: "sess_a",
            cwd: "/home/user/project",
            title: "Implement list",
            updatedAt: "2025-10-29T14:22:15Z",
            _meta: { messageCount: 12 },
          },
          { sessionId: "sess_b", cwd: "/other" },
        ],
      },
      "kimi",
    );
    expect(rows).toHaveLength(2);
    expect(rows[0]).toMatchObject({
      id: "sess_a",
      cwd: "/home/user/project",
      title: "Implement list",
      updatedAt: "2025-10-29T14:22:15Z",
      numMessages: 12,
      agentId: "kimi",
    });
    expect(rows[1]).toMatchObject({
      id: "sess_b",
      cwd: "/other",
      title: "sess_b",
      agentId: "kimi",
    });
    expect(rows.every((s) => s.agentId === "kimi")).toBe(true);
  });

  it("accepts an array root and skips junk", () => {
    const rows = mapAcpListedSessions(
      [{ sessionId: "ok" }, null, { title: "no id" }, { sessionId: "" }, "x", { id: "alt" }],
      "grok",
    );
    expect(rows.map((s) => s.id)).toEqual(["ok", "alt"]);
    expect(rows.every((s) => s.agentId === "grok")).toBe(true);
  });

  it("returns [] for empty or unknown payloads", () => {
    expect(mapAcpListedSessions(null, "claude")).toEqual([]);
    expect(mapAcpListedSessions({}, "claude")).toEqual([]);
    expect(mapAcpListedSessions({ sessions: null }, "codex")).toEqual([]);
  });
});

describe("unionSessionsById", () => {
  it("lets ACP win on the same id+agentId without dropping other disk rows", () => {
    const disk = [
      row({ id: "g1", agentId: "grok", title: "disk grok" }),
      row({ id: "shared", agentId: "kimi", title: "disk kimi", cwd: "/disk" }),
    ];
    const acp = [
      row({ id: "shared", agentId: "kimi", title: "acp kimi", cwd: "/acp" }),
      row({ id: "new", agentId: "kimi", title: "acp only" }),
    ];
    const out = unionSessionsById(disk, acp);
    expect(out).toEqual([
      row({ id: "g1", agentId: "grok", title: "disk grok" }),
      row({ id: "shared", agentId: "kimi", title: "acp kimi", cwd: "/acp" }),
      row({ id: "new", agentId: "kimi", title: "acp only" }),
    ]);
  });

  it("keeps same id when agentIds differ", () => {
    const out = unionSessionsById(
      [row({ id: "s1", agentId: "grok", title: "grok" })],
      [row({ id: "s1", agentId: "kimi", title: "kimi" })],
    );
    expect(out.map((s) => s.agentId)).toEqual(["grok", "kimi"]);
  });
});

describe("maybeFetchAcpSessionList", () => {
  it("does not call session/list when list is not advertised", async () => {
    const rpc = vi.fn(async () => ({ sessions: [{ sessionId: "x" }] }));
    const rows = await maybeFetchAcpSessionList({
      initializeResult: { agentCapabilities: { loadSession: true } },
      agentId: "claude",
      rpc,
    });
    expect(rows).toBeNull();
    expect(rpc).not.toHaveBeenCalled();
  });

  it("calls session/list and maps when advertised", async () => {
    const rpc = vi.fn(async () => ({ sessions: [{ sessionId: "live" }] }));
    const rows = await maybeFetchAcpSessionList({
      initializeResult: { agentCapabilities: { sessionCapabilities: { list: {} } } },
      agentId: "kimi",
      rpc,
    });
    expect(rpc).toHaveBeenCalledTimes(1);
    expect(rpc).toHaveBeenCalledWith("session/list", {}, { agentId: "kimi" });
    expect(rows?.map((s) => ({ id: s.id, agentId: s.agentId }))).toEqual([{ id: "live", agentId: "kimi" }]);
  });
});
