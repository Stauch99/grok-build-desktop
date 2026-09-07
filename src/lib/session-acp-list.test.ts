import { describe, expect, it, vi } from "vitest";
import type { SessionSummary } from "../api";
import {
  catalogSessions,
  createdSessionSummary,
  dropDiskSession,
  isMissingSessionError,
  mapAcpListedSessions,
  maybeFetchAcpSessionList,
  omitListedSession,
  rememberCreatedSession,
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

  it("keeps disk cwd when ACP omits it", () => {
    const disk = [row({ id: "c1", agentId: "claude", cwd: "/work", title: "disk" })];
    const acp = [row({ id: "c1", agentId: "claude", cwd: "", title: "acp" })];
    const out = unionSessionsById(disk, acp);
    expect(out[0].title).toBe("acp");
    expect(out[0].cwd).toBe("/work");
  });

  it("keeps a generated disk title when ACP still lists the uuid", () => {
    const disk = [row({ id: "c1", agentId: "claude", title: "列表刷新" })];
    const acp = [row({ id: "c1", agentId: "claude", title: "c1" })];
    expect(unionSessionsById(disk, acp)[0].title).toBe("列表刷新");
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

describe("catalogSessions", () => {
  it("keeps a just-created Claude session when disk has not scanned the jsonl yet", () => {
    const created = createdSessionSummary({
      id: "c1",
      cwd: "/Users/foxie/project_development/grok_build_desktop",
      agentId: "claude",
      nowIso: "2026-09-07T07:00:00.000Z",
    });
    const { rows, created: leftover } = catalogSessions({ disk: [], acp: [], created: [created] });
    expect(rows).toEqual([created]);
    expect(leftover).toEqual([created]);
  });

  it("drops the placeholder once disk has the same id+agent", () => {
    const created = createdSessionSummary({
      id: "c1",
      cwd: "/work",
      agentId: "claude",
      nowIso: "2026-09-07T07:00:00.000Z",
    });
    const disk = [
      row({
        id: "c1",
        agentId: "claude",
        title: "修列表",
        dir: "/Users/me/.claude/projects/p/c1.jsonl",
      }),
    ];
    const { rows, created: leftover } = catalogSessions({ disk, acp: [], created: [created] });
    expect(rows).toEqual(disk);
    expect(leftover).toEqual([]);
  });

  it("keeps the picked model on the chip until disk records it", () => {
    const created = createdSessionSummary({
      id: "g1",
      cwd: "/work",
      agentId: "grok",
      model: "grok-4.6",
      nowIso: "2026-09-07T07:00:00.000Z",
    });
    const disk = [row({ id: "g1", agentId: "grok", title: "整理桌面" })];
    const { rows, created: leftover } = catalogSessions({ disk, acp: [], created: [created] });
    expect(rows.find((s) => s.id === "g1")?.model).toBe("grok-4.6");
    expect(leftover).toEqual([created]);
  });

  it("survives a disk refresh that still misses the new Claude jsonl", () => {
    const grok = row({ id: "g1", agentId: "grok", title: "old grok" });
    const created = createdSessionSummary({
      id: "c1",
      cwd: "/work",
      agentId: "claude",
      nowIso: "2026-09-07T07:00:00.000Z",
    });
    const { rows } = catalogSessions({ disk: [grok], acp: [], created: [created] });
    expect(rows.map((s) => s.id)).toEqual(["g1", "c1"]);
  });

  it("uses first-user text as the placeholder title instead of the session id", () => {
    const created = createdSessionSummary({
      id: "c1",
      cwd: "/work",
      agentId: "claude",
      title: "  帮我修列表标题  ",
      nowIso: "2026-09-07T07:00:00.000Z",
    });
    expect(created.title).toBe("帮我修列表标题");
  });

  it("does not treat the uuid as a real title", () => {
    expect(
      createdSessionSummary({
        id: "aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa",
        cwd: "/work",
        agentId: "codex",
        nowIso: "2026-09-07T07:00:00.000Z",
      }).title,
    ).toBe("");
  });

  it("keeps the first-user title when disk or ACP still only has the session id", () => {
    const created = createdSessionSummary({
      id: "c1",
      cwd: "/work",
      agentId: "claude",
      title: "修列表",
      nowIso: "2026-09-07T07:00:00.000Z",
    });
    const disk = [
      row({
        id: "c1",
        agentId: "claude",
        title: "c1",
        dir: "/Users/me/.claude/projects/p/c1.jsonl",
      }),
    ];
    const { rows, created: leftover } = catalogSessions({ disk, acp: [], created: [created] });
    expect(rows.find((s) => s.id === "c1")?.title).toBe("修列表");
    expect(leftover).toEqual([created]);
  });

  it("keeps the first-user title over Grok 未命名会话 until generated_title exists", () => {
    const created = createdSessionSummary({
      id: "g1",
      cwd: "/work",
      agentId: "grok",
      title: "整理桌面",
      nowIso: "2026-09-07T07:00:00.000Z",
    });
    const disk = [row({ id: "g1", agentId: "grok", title: "未命名会话" })];
    const { rows, created: leftover } = catalogSessions({ disk, acp: [], created: [created] });
    expect(rows.find((s) => s.id === "g1")?.title).toBe("整理桌面");
    expect(leftover).toEqual([created]);
  });

  it("lets a generated disk title replace the first-user placeholder", () => {
    const created = createdSessionSummary({
      id: "c1",
      cwd: "/work",
      agentId: "claude",
      title: "修列表",
      nowIso: "2026-09-07T07:00:00.000Z",
    });
    const disk = [
      row({
        id: "c1",
        agentId: "claude",
        title: "列表刷新",
        dir: "/Users/me/.claude/projects/p/c1.jsonl",
      }),
    ];
    const { rows, created: leftover } = catalogSessions({ disk, acp: [], created: [created] });
    expect(rows.find((s) => s.id === "c1")?.title).toBe("列表刷新");
    expect(leftover).toEqual([]);
  });

  it("keeps the created cwd when ACP lists the session without one", () => {
    const created = createdSessionSummary({
      id: "c1",
      cwd: "/work",
      agentId: "claude",
      nowIso: "2026-09-07T07:00:00.000Z",
    });
    const acp = [row({ id: "c1", agentId: "claude", cwd: "", title: "c1" })];
    const { rows, created: leftover } = catalogSessions({ disk: [], acp, created: [created] });
    expect(rows.find((s) => s.id === "c1")?.cwd).toBe("/work");
    expect(leftover).toEqual([created]);
  });
});

describe("rememberCreatedSession", () => {
  it("replaces the same id+agent so a retry does not duplicate", () => {
    const first = createdSessionSummary({
      id: "c1",
      cwd: "/a",
      agentId: "claude",
      nowIso: "2026-09-07T07:00:00.000Z",
    });
    const second = createdSessionSummary({
      id: "c1",
      cwd: "/b",
      agentId: "claude",
      nowIso: "2026-09-07T07:01:00.000Z",
    });
    expect(rememberCreatedSession([first], second)).toEqual([second]);
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
