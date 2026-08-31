import { describe, expect, it } from "vitest";
import type { SessionSummary } from "../api";
import {
  DEFAULT_SIDEBAR_LIST,
  INBOX_PIN,
  applyGrouping,
  buildSidebarSections,
  groupSidebarBands,
  formatTokenCount,
  loadSidebarList,
  matchesStatusFilter,
  projectForSession,
  prunePinnedProjects,
  pruneSessionTokens,
  resolveLastWorkspace,
  lastWorkspaceAfterOpen,
  resumeWorkspaceCwd,
  sessionInLibrary,
  statusBucket,
  timeBucket,
  toggleShow,
  toggleStatusFilter,
  tokenForRow,
  worktreeLabel,
  sessionAgentPill,
  type SidebarSection,
} from "./sidebar-list";
import { AGENT_IDS } from "./agent-id";

describe("loadSidebarList", () => {
  it("returns defaults for junk", () => {
    expect(loadSidebarList(undefined)).toEqual(DEFAULT_SIDEBAR_LIST);
    expect(loadSidebarList({ grouping: "nope" }).grouping).toBe("project");
  });

  it("keeps status visible unless explicitly false", () => {
    expect(loadSidebarList({}).showStatus).toBe(true);
    expect(loadSidebarList({ showStatus: false }).showStatus).toBe(false);
  });

  it("accepts a valid payload", () => {
    const prefs = loadSidebarList({
      grouping: "updated",
      ordering: "title",
      showTokens: true,
      showStatus: false,
      showWorktree: true,
      statusFilter: ["working", "bogus"],
      includeArchived: true,
    });
    expect(prefs).toEqual({
      grouping: "updated",
      ordering: "title",
      showTokens: true,
      showStatus: false,
      showWorktree: true,
      statusFilter: ["working"],
      includeArchived: true,
    });
  });
});

describe("prune helpers", () => {
  it("keeps inbox pin and live project paths", () => {
    expect(prunePinnedProjects([INBOX_PIN, "/gone", "/keep"], ["/keep"])).toEqual([INBOX_PIN, "/keep"]);
  });

  it("drops tokens for deleted sessions", () => {
    expect(pruneSessionTokens({ a: 12, b: 3 }, ["b"])).toEqual({ b: 3 });
  });
});

describe("resolveLastWorkspace", () => {
  it("uses a live project path", () => {
    expect(resolveLastWorkspace("/p", ["/p", "/q"], "/inbox")).toBe("/p");
  });

  it("maps inbox sentinel and inbox cwd to inbox", () => {
    expect(resolveLastWorkspace(INBOX_PIN, ["/p"], "/inbox")).toBe("/inbox");
    expect(resolveLastWorkspace("/inbox", ["/p"], "/inbox")).toBe("/inbox");
  });

  it("falls back to first project then inbox", () => {
    expect(resolveLastWorkspace("/gone", ["/p"], "/inbox")).toBe("/p");
    expect(resolveLastWorkspace("/gone", [], "/inbox")).toBe("/inbox");
  });
});

describe("resumeWorkspaceCwd", () => {
  it("skips empty cwd so setWorkspace is not called", () => {
    expect(resumeWorkspaceCwd("")).toBeNull();
    expect(resumeWorkspaceCwd("   ")).toBeNull();
    expect(resumeWorkspaceCwd("/tmp/work")).toBe("/tmp/work");
  });
});

describe("lastWorkspaceAfterOpen", () => {
  it("keeps the current last workspace when the session has no cwd", () => {
    expect(lastWorkspaceAfterOpen("", "/inbox", "/proj")).toBe("/proj");
  });

  it("maps an inbox cwd to the inbox pin", () => {
    expect(lastWorkspaceAfterOpen("/inbox", "/inbox", "/proj")).toBe(INBOX_PIN);
  });

  it("adopts a real session cwd", () => {
    expect(lastWorkspaceAfterOpen("/other", "/inbox", "/proj")).toBe("/other");
  });
});

function s(partial: Partial<SessionSummary> & Pick<SessionSummary, "id" | "cwd">): SessionSummary {
  return {
    title: partial.id,
    updatedAt: "2026-08-27T12:00:00.000Z",
    createdAt: "2026-08-27T12:00:00.000Z",
    numMessages: 1,
    ...partial,
  };
}

const now = Date.parse("2026-08-27T18:00:00.000Z");

/** Local-midnight-safe ISO for `now`, so today/yesterday/week/month/older hold in any TZ. */
function localIso(nowMs: number, daysAgo: number, hour = 12, minute = 0): string {
  const d = new Date(nowMs);
  d.setHours(0, 0, 0, 0);
  d.setDate(d.getDate() - daysAgo);
  d.setHours(hour, minute, 0, 0);
  return d.toISOString();
}

describe("projectForSession", () => {
  it("picks the longest matching project prefix", () => {
    expect(projectForSession("/work/app/wt-1", ["/work", "/work/app"], "/inbox")).toEqual({
      path: "/work/app",
      inbox: false,
    });
  });

  it("uses inbox when cwd is the inbox", () => {
    expect(projectForSession("/inbox", ["/work"], "/inbox")).toEqual({ path: INBOX_PIN, inbox: true });
  });
});

describe("sessionInLibrary", () => {
  it("keeps inbox chats and sessions under an added project", () => {
    expect(sessionInLibrary("/inbox", ["/work/app"], "/inbox")).toBe(true);
    expect(sessionInLibrary("/work/app", ["/work/app"], "/inbox")).toBe(true);
    expect(sessionInLibrary("/work/app/wt-1", ["/work/app"], "/inbox")).toBe(true);
  });

  it("hides history whose directory was never added", () => {
    expect(sessionInLibrary("/old/other", ["/work/app"], "/inbox")).toBe(false);
    expect(sessionInLibrary("", ["/work/app"], "/inbox")).toBe(false);
    expect(sessionInLibrary("/work/app", [], "/inbox")).toBe(false);
  });
});

describe("worktreeLabel / tokens", () => {
  it("omits the label when cwd is the project root", () => {
    expect(worktreeLabel("/work/app", "/work/app", "/inbox")).toBeUndefined();
  });

  it("shows basename when cwd is a nested worktree", () => {
    expect(worktreeLabel("/work/app/wt-1", "/work/app", "/inbox")).toBe("wt-1");
  });

  it("omits missing tokens but keeps zero", () => {
    expect(tokenForRow("a", {})).toBeUndefined();
    expect(tokenForRow("a", { a: 0 })).toBe(0);
    expect(formatTokenCount(420)).toBe("420");
    expect(formatTokenCount(1200)).toBe("1.2k");
  });
});

describe("time and status buckets", () => {
  it("splits local calendar days", () => {
    expect(timeBucket(localIso(now, 0, 1), now)).toBe("today");
    expect(timeBucket(localIso(now, 1, 12), now)).toBe("yesterday");
    expect(timeBucket(localIso(now, 6, 12), now)).toBe("week");
    expect(timeBucket(localIso(now, 26, 12), now)).toBe("month");
    expect(timeBucket(localIso(now, 87, 12), now)).toBe("older");
  });

  it("maps session status to buckets and filters", () => {
    expect(statusBucket("needs-you")).toBe("needs-you");
    expect(statusBucket("done")).toBe("unread");
    expect(statusBucket("idle")).toBe("other");
    expect(matchesStatusFilter("idle", [])).toBe(true);
    expect(matchesStatusFilter("idle", ["done"])).toBe(true);
    expect(matchesStatusFilter("working", ["done"])).toBe(false);
    expect(matchesStatusFilter("done", ["unread"])).toBe(true);
  });
});

describe("buildSidebarSections", () => {
  const projects = ["/work/app", "/work/other"];
  const sessions = [
    s({ id: "pin", cwd: "/work/app", title: "Pinned", updatedAt: localIso(now, 0, 10) }),
    s({ id: "a", cwd: "/work/app", title: "Alpha", updatedAt: localIso(now, 0, 11) }),
    s({ id: "wt", cwd: "/work/app/wt-1", title: "Worktree", updatedAt: localIso(now, 1, 11) }),
    s({ id: "in", cwd: "/inbox", title: "Inbox", updatedAt: localIso(now, 0, 9) }),
    s({ id: "draft", cwd: "/work/app", numMessages: 0 }),
  ];
  const base = {
    sessions,
    projects,
    inboxCwd: "/inbox",
    pinned: ["pin"],
    pinnedProjects: ["/work/app"],
    archived: [] as string[],
    autoArchiveDays: 0,
    now,
    prefs: DEFAULT_SIDEBAR_LIST,
    titles: {} as Record<string, string>,
    statusFor: () => "idle" as const,
    sessionTokens: { a: 1200 },
  };

  it("puts pinned sessions only in 置顶 and groups the rest by project", () => {
    const sections = buildSidebarSections({
      ...base,
      prefs: { ...DEFAULT_SIDEBAR_LIST, showWorktree: true },
    });
    expect(sections[0]).toMatchObject({ id: "pin", kind: "pin", band: "pin" });
    expect(sections[0].rows.map((r) => r.session.id)).toEqual(["pin"]);
    const app = sections.find((x) => x.projectPath === "/work/app");
    expect(app?.band).toBe("pin");
    expect(app?.rows.map((r) => r.session.id)).toEqual(["a", "wt"]);
    expect(app?.rows.find((r) => r.session.id === "wt")?.worktree).toBe("wt-1");
    const inbox = sections.find((x) => x.id === "inbox");
    expect(inbox).toMatchObject({ kind: "inbox", band: "inbox", label: "独立对话" });
    expect(inbox?.projectPath).toBeUndefined();
    expect(inbox?.rows.map((r) => r.session.id)).toEqual(["in"]);
    expect(sections.some((x) => x.rows.some((r) => r.session.id === "draft"))).toBe(false);
  });

  it("does not dump other-directory history into 独立对话", () => {
    const sections = buildSidebarSections({
      ...base,
      pinned: [],
      sessions: [
        ...base.sessions,
        s({ id: "stray", cwd: "/old/other", title: "Stray", updatedAt: localIso(now, 0, 12) }),
      ],
    });
    expect(sections.some((x) => x.rows.some((r) => r.session.id === "stray"))).toBe(false);
    expect(sections.find((x) => x.id === "inbox")?.rows.map((r) => r.session.id)).toEqual(["in"]);
  });

  it("keeps pinned projects in the pin band and unpinned projects in their own band", () => {
    const sections = buildSidebarSections({
      ...base,
      pinned: [],
      sessions: [
        ...base.sessions.filter((x) => x.id !== "pin"),
        s({ id: "other", cwd: "/work/other", title: "Other", updatedAt: localIso(now, 0, 8) }),
      ],
    });
    const app = sections.find((x) => x.projectPath === "/work/app");
    const other = sections.find((x) => x.projectPath === "/work/other");
    expect(app?.band).toBe("pin");
    expect(other?.band).toBe("projects");
    expect(sections.filter((x) => x.kind === "project").map((x) => x.projectPath)).toEqual([
      "/work/app",
      "/work/other",
    ]);
    expect(groupSidebarBands(sections).map((b) => ({ id: b.id, label: b.label }))).toEqual([
      { id: "pin", label: "置顶" },
      { id: "projects", label: "项目" },
      { id: "inbox", label: "独立对话" },
    ]);
  });

  it("never folds independent chats into a project folder, even if inbox is pinned", () => {
    const sections = buildSidebarSections({
      ...base,
      pinned: [],
      pinnedProjects: [INBOX_PIN],
    });
    expect(sections.filter((x) => x.kind === "project").map((x) => x.id)).not.toContain("inbox");
    expect(sections.find((x) => x.kind === "inbox")).toMatchObject({ id: "inbox", band: "inbox" });
  });

  it("groups by updated time without duplicating pins", () => {
    const sections = buildSidebarSections({
      ...base,
      prefs: { ...DEFAULT_SIDEBAR_LIST, grouping: "updated" },
    });
    expect(sections[0].kind).toBe("pin");
    const today = sections.find((x) => x.id === "today");
    expect(today?.rows.map((r) => r.session.id)).toEqual(["a", "in"]);
    expect(sections.find((x) => x.id === "yesterday")?.rows.map((r) => r.session.id)).toEqual(["wt"]);
  });
});

describe("groupSidebarBands hides empty bands", () => {
  const pinSessions = (rows: SidebarSection["rows"]): SidebarSection => ({
    id: "pin",
    label: "置顶",
    kind: "pin",
    band: "pin",
    rows,
  });
  const project = (
    path: string,
    band: "pin" | "projects",
    rows: SidebarSection["rows"] = [],
  ): SidebarSection => ({
    id: path,
    label: path.split("/").pop() ?? path,
    kind: "project",
    band,
    projectPath: path,
    rows,
  });
  const inbox = (rows: SidebarSection["rows"]): SidebarSection => ({
    id: "inbox",
    label: "独立对话",
    kind: "inbox",
    band: "inbox",
    rows,
  });

  it("hides 置顶 when it only has an empty pin-session list", () => {
    const bands = groupSidebarBands([pinSessions([]), project("/work/app", "projects")]);
    expect(bands.map((b) => b.id)).toEqual(["projects"]);
  });

  it("keeps 置顶 when a pinned project folder has no sessions", () => {
    const bands = groupSidebarBands([project("/work/app", "pin")]);
    expect(bands.map((b) => b.id)).toEqual(["pin"]);
    expect(bands[0].sections[0].rows).toEqual([]);
  });

  it("keeps 置顶 when empty pin sessions sit beside a pinned folder", () => {
    const bands = groupSidebarBands([pinSessions([]), project("/work/app", "pin")]);
    expect(bands.map((b) => b.id)).toEqual(["pin"]);
  });

  it("hides 独立对话 when it has zero rows", () => {
    const bands = groupSidebarBands([project("/work/app", "projects"), inbox([])]);
    expect(bands.map((b) => b.id)).toEqual(["projects"]);
  });

  it("keeps 项目 when folders have no sessions", () => {
    const bands = groupSidebarBands([project("/work/app", "projects"), project("/work/other", "projects")]);
    expect(bands.map((b) => b.id)).toEqual(["projects"]);
    expect(bands[0].sections.map((s) => s.rows.length)).toEqual([0, 0]);
  });
});

describe("list menu prefs helpers", () => {
  it("replaces grouping exclusively and keeps other prefs", () => {
    const start = { ...DEFAULT_SIDEBAR_LIST, grouping: "project" as const, showTokens: true };
    const next = applyGrouping(start, "status");
    expect(next.grouping).toBe("status");
    expect(next.showTokens).toBe(true);
    expect(applyGrouping(next, "updated").grouping).toBe("updated");
  });

  it("toggles show flags on and off", () => {
    const on = toggleShow(DEFAULT_SIDEBAR_LIST, "showTokens");
    expect(on.showTokens).toBe(true);
    expect(toggleShow(on, "showTokens").showTokens).toBe(false);
    expect(toggleShow(DEFAULT_SIDEBAR_LIST, "showStatus").showStatus).toBe(false);
    expect(toggleShow(DEFAULT_SIDEBAR_LIST, "showWorktree").showWorktree).toBe(true);
  });

  it("adds and removes status filter flags", () => {
    const a = toggleStatusFilter(DEFAULT_SIDEBAR_LIST, "working");
    expect(a.statusFilter).toEqual(["working"]);
    const b = toggleStatusFilter(a, "done");
    expect(b.statusFilter).toEqual(["working", "done"]);
    expect(toggleStatusFilter(b, "working").statusFilter).toEqual(["done"]);
  });
});

describe("sessionAgentPill", () => {
  it("defaults missing, null, and junk agent ids to grok", () => {
    const grok = { agentId: "grok", label: "Grok", className: "sess-agent sess-agent-grok" };
    expect(sessionAgentPill()).toEqual(grok);
    expect(sessionAgentPill(null)).toEqual(grok);
    expect(sessionAgentPill("not-an-agent")).toEqual(grok);
  });

  it("maps claude to its label and class", () => {
    expect(sessionAgentPill("claude")).toEqual({
      agentId: "claude",
      label: "Claude",
      className: "sess-agent sess-agent-claude",
    });
  });

  it("gives each agent id a distinct className", () => {
    const classes = AGENT_IDS.map((id) => sessionAgentPill(id).className);
    expect(classes).toEqual([
      "sess-agent sess-agent-grok",
      "sess-agent sess-agent-kimi",
      "sess-agent sess-agent-claude",
      "sess-agent sess-agent-codex",
    ]);
    expect(new Set(classes).size).toBe(4);
  });
});
