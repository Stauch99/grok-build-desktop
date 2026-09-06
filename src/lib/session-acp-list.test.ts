import { describe, expect, it, vi } from "vitest";
import type { SessionSummary } from "../api";
import {
  dropDiskSession,
  isMissingSessionError,
  mapAcpListedSessions,
  maybeFetchAcpSessionList,
  omitListedSession,
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

  it("maps parentSessionId from ACP rows", () => {
    const rows = mapAcpListedSessions(
      { sessions: [{ sessionId: "child", cwd: "/w", parentSessionId: "parent" }] },
      "kimi",
    );
    expect(rows[0].parentSessionId).toBe("parent");
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

  it("keeps disk parent when ACP omits it", () => {
    const disk = [row({ id: "child", agentId: "kimi", parentSessionId: "parent", title: "disk" })];
    const acp = [row({ id: "child", agentId: "kimi", title: "acp" })];
    const out = unionSessionsById(disk, acp);
    expect(out[0].title).toBe("acp");
    expect(out[0].parentSessionId).toBe("parent");
  });

  it("keeps disk dir when ACP omits it", () => {
    const disk = [
      row({
        id: "e799",
        agentId: "claude",
        title: "e799",
        dir: "/Users/foxie/.claude/projects/p/e799.jsonl",
      }),
    ];
    const acp = [row({ id: "e799", agentId: "claude", title: "继续" })];
    const out = unionSessionsById(disk, acp);
    expect(out[0].title).toBe("继续");
    expect(out[0].dir).toBe("/Users/foxie/.claude/projects/p/e799.jsonl");
  });

  it("keeps disk toolUseId when ACP omits it", () => {
    const disk = [
      row({
        id: "child",
        agentId: "claude",
        parentSessionId: "parent",
        sessionKind: "subagent",
        toolUseId: "toolu_1",
        title: "disk",
      }),
    ];
    const acp = [row({ id: "child", agentId: "claude", title: "acp" })];
    const out = unionSessionsById(disk, acp);
    expect(out[0].title).toBe("acp");
    expect(out[0].toolUseId).toBe("toolu_1");
    expect(out[0].parentSessionId).toBe("parent");
  });
});

describe("omitListedSession", () => {
  it("drops the id from every agent list so a refresh cannot resurrect it", () => {
    const listed = {
      claude: [
        row({ id: "gone", agentId: "claude" }),
        row({ id: "kid", agentId: "claude", parentSessionId: "gone" }),
        row({ id: "keep", agentId: "claude" }),
      ],
      grok: [row({ id: "gone", agentId: "grok" })],
    };
    const next = omitListedSession(listed, "gone");
    expect(next.claude?.map((s) => s.id)).toEqual(["keep"]);
    expect(next.grok).toEqual([]);
  });
});

describe("dropDiskSession", () => {
  it("drops the session and its children so a stale disk cache cannot resurrect them", () => {
    const disk = [
      row({ id: "gone" }),
      row({ id: "kid", parentSessionId: "gone" }),
      row({ id: "keep" }),
    ];
    expect(dropDiskSession(disk, "gone").map((s) => s.id)).toEqual(["keep"]);
  });
});

describe("isMissingSessionError", () => {
  it("treats not-found as a successful hide", () => {
    expect(isMissingSessionError("session not found")).toBe(true);
    expect(isMissingSessionError({ message: "session not found" })).toBe(true);
    expect(isMissingSessionError("permission denied")).toBe(false);
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
