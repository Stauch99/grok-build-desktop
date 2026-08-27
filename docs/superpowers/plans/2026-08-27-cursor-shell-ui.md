# Cursor-inspired Agents Shell Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Restyle Grok Build Desktop as a Cursor Agents shell: regroupable workspace list, account menu, floating composer, toggleable right pane with a four-tile landing, and card-based in-app settings — without changing ACP/session routing.

**Architecture:** Keep `App.tsx` as the session/ACP owner. Put list grouping, review-tab rules, palette submit, and settings search in pure `src/lib/*` modules with Vitest coverage. React components (`Sidebar`, `ReviewRail`, `Composer`, `Settings`) consume those modules. Persist new prefs in `~/.grok/webui.json`.

**Tech Stack:** React 19, TypeScript, Vite, Vitest, existing CSS tokens in `src/styles.css`, Tauri 2 (no new crates).

## Global Constraints

- Shell: Cursor Agents chrome. Do not ship an embedded browser or a PTY terminal.
- Default list grouping: by project (Workspace).
- Settings stay in-app (overlay), restyled as left categories + search + card rows.
- Sidebar top actions: New Chat and Search only. Extensions and Settings live in the account menu.
- Theme: keep the existing light/dark toggle and current default. Do not add a typeface or a third theme family.
- Do not rewrite agent runtime, ACP process lifecycle, or `App.tsx` session routing.
- Split still forces the right pane closed.
- Never list-call `readSessionUsage` for the whole sidebar.
- Do not add PR, Environment, or Source filters.
- Terminal tile = `openInTerminal(cwd)` + bash-classified tool list. Not a PTY.
- Copy stays Chinese for chrome. Product is not a full IDE.
- Skip git commit steps unless the user has explicitly asked to commit.
- Tests: `npx vitest run <file>`. Full suite: `npm test`.

**Spec:** `docs/superpowers/specs/2026-08-27-cursor-shell-ui-design.md`

---

## File map

| File | Responsibility |
|---|---|
| `src/api.ts` | `WebuiState` new fields |
| `src/lib/state-authority.ts` | Register new desktop keys |
| `src/lib/sidebar-list.ts` | Group/sort/filter/pin/row extras (no React) |
| `src/lib/review-rail.ts` | `home` / `terminal` tabs, toggle restore |
| `src/lib/palette.ts` | Enter-with-no-hit → session text search |
| `src/lib/tool-render.ts` | `bashTools(items)` |
| `src/lib/settings-search.ts` | Client-side settings row filter |
| `src/components/Sidebar.tsx` | New chrome, list, account row |
| `src/components/SidebarListMenu.tsx` | Grouping/filter menu |
| `src/components/AccountMenu.tsx` | Profile popup |
| `src/components/SessionBranch.tsx` | Subtitle, token, worktree, showStatus |
| `src/components/ReviewHome.tsx` | 2×2 landing |
| `src/components/ReviewRail.tsx` | Back to home, hide tablist on home |
| `src/components/Composer.tsx` | Workspace chips |
| `src/components/EmptyState.tsx` | Blockers only |
| `src/components/CommandPalette.tsx` | Empty-enter search |
| `src/Settings.tsx` | Cards + search + shortcuts focus |
| `src/App.tsx` | Wire prefs, new chat cwd, tokens, review children |
| `src/styles.css` | Shell visual language |
| `design/grok-build-desktop/PRODUCT.md` | P1 IA |
| `README.md` | Capability bullets |

---

### Task 1: Persist list prefs and prune helpers

**Files:**
- Modify: `src/api.ts` (`WebuiState`)
- Modify: `src/lib/state-authority.ts`
- Create: `src/lib/sidebar-list.ts` (types + load/prune only in this task)
- Test: `src/lib/state-authority.test.ts`
- Test: `src/lib/sidebar-list.test.ts`

**Interfaces:**
- Consumes: existing `WebuiState`, `authorityForState`
- Produces:
  - `INBOX_PIN = "inbox"`
  - `SidebarGrouping = "project" | "updated" | "status"`
  - `SidebarOrdering = "updated" | "title"`
  - `StatusFilter = "needs-you" | "unread" | "working" | "done"`
  - `SidebarListPrefs` with fields `grouping`, `ordering`, `showTokens`, `showStatus`, `showWorktree`, `statusFilter`, `includeArchived`
  - `DEFAULT_SIDEBAR_LIST: SidebarListPrefs`
  - `loadSidebarList(raw: unknown): SidebarListPrefs`
  - `prunePinnedProjects(pinned: string[], projectPaths: string[]): string[]`
  - `pruneSessionTokens(tokens: Record<string, number>, liveIds: string[]): Record<string, number>`
  - `resolveLastWorkspace(raw: string | undefined, projects: string[], inboxCwd: string): string`
  - `WebuiState` adds `lastWorkspace?: string`, `pinnedProjects?: string[]`, `sessionTokens?: Record<string, number>`, `sidebarList?: SidebarListPrefs`

- [ ] **Step 1: Write the failing tests**

Add to `src/lib/state-authority.test.ts` inside the existing `it.each` array:

```ts
["lastWorkspace", "desktop-preferences", "webui.json"],
["pinnedProjects", "desktop-preferences", "webui.json"],
["sessionTokens", "desktop-preferences", "webui.json"],
["sidebarList", "desktop-preferences", "webui.json"],
```

Create `src/lib/sidebar-list.test.ts`:

```ts
import { describe, expect, it } from "vitest";
import {
  DEFAULT_SIDEBAR_LIST,
  INBOX_PIN,
  loadSidebarList,
  prunePinnedProjects,
  pruneSessionTokens,
  resolveLastWorkspace,
} from "./sidebar-list";

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
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `npx vitest run src/lib/sidebar-list.test.ts src/lib/state-authority.test.ts`

Expected: FAIL — `sidebar-list` not found and/or unknown keys in `authorityForState`.

- [ ] **Step 3: Write minimal implementation**

In `src/api.ts` inside `WebuiState`, add:

```ts
  lastWorkspace?: string;
  pinnedProjects?: string[];
  sessionTokens?: Record<string, number>;
  sidebarList?: {
    grouping?: "project" | "updated" | "status";
    ordering?: "updated" | "title";
    showTokens?: boolean;
    showStatus?: boolean;
    showWorktree?: boolean;
    statusFilter?: Array<"needs-you" | "unread" | "working" | "done">;
    includeArchived?: boolean;
  };
```

In `src/lib/state-authority.ts`, add `"lastWorkspace", "pinnedProjects", "sessionTokens", "sidebarList"` to `DESKTOP_KEYS`.

Create `src/lib/sidebar-list.ts`:

```ts
import { sameCwd, normalizeCwd } from "./inbox";

export const INBOX_PIN = "inbox";

export type SidebarGrouping = "project" | "updated" | "status";
export type SidebarOrdering = "updated" | "title";
export type StatusFilter = "needs-you" | "unread" | "working" | "done";

export type SidebarListPrefs = {
  grouping: SidebarGrouping;
  ordering: SidebarOrdering;
  showTokens: boolean;
  showStatus: boolean;
  showWorktree: boolean;
  statusFilter: StatusFilter[];
  includeArchived: boolean;
};

export const DEFAULT_SIDEBAR_LIST: SidebarListPrefs = {
  grouping: "project",
  ordering: "updated",
  showTokens: false,
  showStatus: true,
  showWorktree: false,
  statusFilter: [],
  includeArchived: false,
};

const GROUPINGS: SidebarGrouping[] = ["project", "updated", "status"];
const ORDERINGS: SidebarOrdering[] = ["updated", "title"];
const FILTERS: StatusFilter[] = ["needs-you", "unread", "working", "done"];

export function loadSidebarList(raw: unknown): SidebarListPrefs {
  const o = raw && typeof raw === "object" ? (raw as Record<string, unknown>) : {};
  const grouping = GROUPINGS.includes(o.grouping as SidebarGrouping) ? (o.grouping as SidebarGrouping) : "project";
  const ordering = ORDERINGS.includes(o.ordering as SidebarOrdering) ? (o.ordering as SidebarOrdering) : "updated";
  const statusFilter = Array.isArray(o.statusFilter)
    ? o.statusFilter.filter((x): x is StatusFilter => FILTERS.includes(x as StatusFilter))
    : [];
  return {
    grouping,
    ordering,
    showTokens: o.showTokens === true,
    showStatus: o.showStatus !== false,
    showWorktree: o.showWorktree === true,
    statusFilter,
    includeArchived: o.includeArchived === true,
  };
}

export function prunePinnedProjects(pinned: string[], projectPaths: string[]): string[] {
  const live = new Set(projectPaths.map((p) => normalizeCwd(p)));
  return pinned.filter((p) => p === INBOX_PIN || live.has(normalizeCwd(p)));
}

export function pruneSessionTokens(tokens: Record<string, number>, liveIds: string[]): Record<string, number> {
  const live = new Set(liveIds);
  const next: Record<string, number> = {};
  for (const [id, n] of Object.entries(tokens)) {
    if (live.has(id) && Number.isFinite(n)) next[id] = n;
  }
  return next;
}

export function resolveLastWorkspace(raw: string | undefined, projects: string[], inboxCwd: string): string {
  if (raw === INBOX_PIN) return inboxCwd || "";
  if (raw && inboxCwd && sameCwd(raw, inboxCwd)) return inboxCwd;
  if (raw && projects.some((p) => sameCwd(p, raw))) return normalizeCwd(raw);
  if (projects[0]) return normalizeCwd(projects[0]);
  return inboxCwd || "";
}
```

- [ ] **Step 4: Run tests to verify they pass**

Run: `npx vitest run src/lib/sidebar-list.test.ts src/lib/state-authority.test.ts`

Expected: PASS

- [ ] **Step 5: Commit (skip unless user asked)**

---

### Task 2: Sidebar list grouping, pins, filters, row extras

**Files:**
- Modify: `src/lib/sidebar-list.ts`
- Modify: `src/lib/sidebar-list.test.ts`

**Interfaces:**
- Consumes: Task 1 types; `SessionSummary` from `src/api.ts`; `visibleSessions` / `partitionPinned` from `src/lib/session-chrome.ts`; `displayTitle` from `src/lib/projects.ts`; `SessionStatus` from `src/lib/session-status.ts`; `basename` from `src/lib/text.ts`; `sameCwd` / `normalizeCwd` from `src/lib/inbox.ts`
- Produces:
  - `projectForSession(cwd: string, projectPaths: string[], inboxCwd: string): { path: string; inbox: boolean }`
  - `worktreeLabel(sessionCwd: string, projectPath: string | null, inboxCwd: string): string | undefined`
  - `formatTokenCount(n: number): string`
  - `tokenForRow(id: string, tokens: Record<string, number>): number | undefined` — omit if missing; keep explicit `0`
  - `timeBucket(iso: string, now: number): "today" | "yesterday" | "week" | "month" | "older"`
  - `statusBucket(status: SessionStatus): "needs-you" | "working" | "unread" | "other"`
  - `matchesStatusFilter(status: SessionStatus, filter: StatusFilter[]): boolean`
  - `SidebarRow = { session: SessionSummary; indent: 0 | 1; subtitle: string; projectPinned: boolean; token?: number; worktree?: string }`
  - `SidebarSection = { id: string; label: string; kind: "pin" | "project" | "time" | "status"; projectPath?: string; rows: SidebarRow[] }`
  - `buildSidebarSections(opts: BuildSidebarOpts): SidebarSection[]`

- [ ] **Step 1: Write the failing tests**

Append to `src/lib/sidebar-list.test.ts`:

```ts
import type { SessionSummary } from "../api";
import {
  buildSidebarSections,
  formatTokenCount,
  matchesStatusFilter,
  projectForSession,
  statusBucket,
  timeBucket,
  tokenForRow,
  worktreeLabel,
} from "./sidebar-list";

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
    expect(timeBucket("2026-08-27T01:00:00.000Z", now)).toBe("today");
    expect(timeBucket("2026-08-26T12:00:00.000Z", now)).toBe("yesterday");
    expect(timeBucket("2026-08-21T12:00:00.000Z", now)).toBe("week");
    expect(timeBucket("2026-08-01T12:00:00.000Z", now)).toBe("month");
    expect(timeBucket("2026-06-01T12:00:00.000Z", now)).toBe("older");
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
    s({ id: "pin", cwd: "/work/app", title: "Pinned", updatedAt: "2026-08-27T10:00:00.000Z" }),
    s({ id: "a", cwd: "/work/app", title: "Alpha", updatedAt: "2026-08-27T11:00:00.000Z" }),
    s({ id: "wt", cwd: "/work/app/wt-1", title: "Worktree", updatedAt: "2026-08-26T11:00:00.000Z" }),
    s({ id: "in", cwd: "/inbox", title: "Inbox", updatedAt: "2026-08-27T09:00:00.000Z" }),
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
    const sections = buildSidebarSections(base);
    expect(sections[0]).toMatchObject({ id: "pin", kind: "pin" });
    expect(sections[0].rows.map((r) => r.session.id)).toEqual(["pin"]);
    const app = sections.find((x) => x.projectPath === "/work/app");
    expect(app?.rows.map((r) => r.session.id)).toEqual(["a", "wt"]);
    expect(app?.rows.find((r) => r.session.id === "wt")?.worktree).toBe("wt-1");
    expect(sections.find((x) => x.id === "inbox")?.rows.map((r) => r.session.id)).toEqual(["in"]);
    expect(sections.some((x) => x.rows.some((r) => r.session.id === "draft"))).toBe(false);
  });

  it("orders pinned projects above unpinned ones", () => {
    const sections = buildSidebarSections({ ...base, pinned: [] });
    const ids = sections.filter((x) => x.kind === "project").map((x) => x.projectPath ?? x.id);
    expect(ids[0]).toBe("/work/app");
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
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx vitest run src/lib/sidebar-list.test.ts`

Expected: FAIL — `buildSidebarSections` is not exported.

- [ ] **Step 3: Write minimal implementation**

Append to `src/lib/sidebar-list.ts` (keep Task 1 exports):

```ts
import type { SessionSummary } from "../api";
import { visibleSessions, partitionPinned } from "./session-chrome";
import { displayTitle } from "./projects";
import type { SessionStatus } from "./session-status";
import { basename } from "./text";

export function projectForSession(cwd: string, projectPaths: string[], inboxCwd: string): { path: string; inbox: boolean } {
  if (inboxCwd && sameCwd(cwd, inboxCwd)) return { path: INBOX_PIN, inbox: true };
  const matches = projectPaths.filter((p) => sameCwd(cwd, p) || normalizeCwd(cwd).startsWith(normalizeCwd(p) + "/"));
  matches.sort((a, b) => normalizeCwd(b).length - normalizeCwd(a).length);
  if (matches[0]) return { path: matches[0], inbox: false };
  return { path: INBOX_PIN, inbox: true };
}

export function worktreeLabel(sessionCwd: string, projectPath: string | null, inboxCwd: string): string | undefined {
  const root = projectPath && projectPath !== INBOX_PIN ? projectPath : inboxCwd;
  if (!root || !sessionCwd) return undefined;
  if (sameCwd(sessionCwd, root)) return undefined;
  return basename(sessionCwd) || undefined;
}

export function formatTokenCount(n: number): string {
  if (!Number.isFinite(n)) return "";
  if (Math.abs(n) < 1000) return String(Math.round(n));
  if (Math.abs(n) < 10_000) return `${Math.round(n / 100) / 10}k`;
  return `${Math.round(n / 1000)}k`;
}
```

Continue:

```ts
export function tokenForRow(id: string, tokens: Record<string, number>): number | undefined {
  if (!Object.prototype.hasOwnProperty.call(tokens, id)) return undefined;
  const n = tokens[id];
  return Number.isFinite(n) ? n : undefined;
}

export type TimeBucket = "today" | "yesterday" | "week" | "month" | "older";

export function timeBucket(iso: string, now: number): TimeBucket {
  const t = Date.parse(iso);
  if (Number.isNaN(t)) return "older";
  const start = new Date(now);
  start.setHours(0, 0, 0, 0);
  const today = start.getTime();
  const day = 24 * 60 * 60 * 1000;
  if (t >= today) return "today";
  if (t >= today - day) return "yesterday";
  if (t >= today - 7 * day) return "week";
  if (t >= today - 30 * day) return "month";
  return "older";
}

export function statusBucket(status: SessionStatus): "needs-you" | "working" | "unread" | "other" {
  if (status === "needs-you") return "needs-you";
  if (status === "working") return "working";
  if (status === "done" || status === "error") return "unread";
  return "other";
}

export function matchesStatusFilter(status: SessionStatus, filter: StatusFilter[]): boolean {
  if (filter.length === 0) return true;
  return filter.some((f) => {
    if (f === "needs-you") return status === "needs-you";
    if (f === "working") return status === "working";
    if (f === "unread") return status === "done" || status === "error";
    return status === "idle";
  });
}

export type SidebarRow = {
  session: SessionSummary;
  indent: 0 | 1;
  subtitle: string;
  projectPinned: boolean;
  token?: number;
  worktree?: string;
};

export type SidebarSection = {
  id: string;
  label: string;
  kind: "pin" | "project" | "time" | "status";
  projectPath?: string;
  rows: SidebarRow[];
};

export type BuildSidebarOpts = {
  sessions: SessionSummary[];
  projects: string[];
  inboxCwd: string;
  pinned: string[];
  pinnedProjects: string[];
  archived: string[];
  autoArchiveDays: number;
  now: number;
  prefs: SidebarListPrefs;
  titles: Record<string, string>;
  statusFor: (id: string) => SessionStatus;
  sessionTokens: Record<string, number>;
};

const TIME_META: Record<TimeBucket, { id: string; label: string }> = {
  today: { id: "today", label: "今天" },
  yesterday: { id: "yesterday", label: "昨天" },
  week: { id: "week", label: "近 7 天" },
  month: { id: "month", label: "近 30 天" },
  older: { id: "older", label: "更早" },
};

const STATUS_META: Record<"needs-you" | "working" | "unread" | "other", { id: string; label: string }> = {
  "needs-you": { id: "needs-you", label: "需要你" },
  working: { id: "working", label: "运行中" },
  unread: { id: "unread", label: "未查看" },
  other: { id: "other", label: "其他" },
};

function sortSessions(rows: SessionSummary[], ordering: SidebarOrdering, titles: Record<string, string>): SessionSummary[] {
  const copy = [...rows];
  if (ordering === "title") {
    copy.sort((a, b) => displayTitle(a, titles).localeCompare(displayTitle(b, titles), "zh"));
  } else {
    copy.sort((a, b) => b.updatedAt.localeCompare(a.updatedAt));
  }
  return copy;
}

function eligibleSessions(opts: BuildSidebarOpts): SessionSummary[] {
  const chrome = {
    pinned: opts.pinned,
    archived: opts.archived,
    autoArchiveDays: opts.autoArchiveDays,
    now: opts.now,
  };
  const active = visibleSessions(opts.sessions, { ...chrome, view: "active" });
  if (!opts.prefs.includeArchived) return active;
  const archived = visibleSessions(opts.sessions, { ...chrome, view: "archived" });
  const seen = new Set(active.map((s) => s.id));
  return [...active, ...archived.filter((s) => !seen.has(s.id))];
}

function toRow(opts: BuildSidebarOpts, session: SessionSummary, indent: 0 | 1): SidebarRow {
  const loc = projectForSession(session.cwd, opts.projects, opts.inboxCwd);
  const projectPath = loc.inbox ? null : loc.path;
  const subtitle = loc.inbox ? "独立对话" : basename(loc.path);
  const projectPinned = loc.inbox
    ? opts.pinnedProjects.includes(INBOX_PIN)
    : opts.pinnedProjects.some((p) => sameCwd(p, loc.path));
  return {
    session,
    indent,
    subtitle,
    projectPinned,
    token: tokenForRow(session.id, opts.sessionTokens),
    worktree: opts.prefs.showWorktree ? worktreeLabel(session.cwd, projectPath, opts.inboxCwd) : undefined,
  };
}

function flattenForks(sessions: SessionSummary[]): Array<{ session: SessionSummary; indent: 0 | 1 }> {
  const byId = new Map(sessions.map((s) => [s.id, s]));
  const ids = new Set(byId.keys());
  return sessions.map((session) => {
    const parent = session.parentSessionId;
    const indent: 0 | 1 = parent && parent !== session.id && ids.has(parent) ? 1 : 0;
    return { session, indent };
  });
}

export function buildSidebarSections(opts: BuildSidebarOpts): SidebarSection[] {
  const filtered = eligibleSessions(opts).filter((s) => matchesStatusFilter(opts.statusFor(s.id), opts.prefs.statusFilter));
  const { pinned, rest } = partitionPinned(filtered, opts.pinned);
  const sections: SidebarSection[] = [];
  if (pinned.length) {
    sections.push({
      id: "pin",
      label: "置顶",
      kind: "pin",
      rows: sortSessions(pinned, opts.prefs.ordering, opts.titles).map((session) => toRow(opts, session, 0)),
    });
  }

  if (opts.prefs.grouping === "project") {
    const pinSet = new Set(opts.pinnedProjects.map((p) => (p === INBOX_PIN ? INBOX_PIN : normalizeCwd(p))));
    const groups = new Map<string, SessionSummary[]>();
    for (const session of rest) {
      const loc = projectForSession(session.cwd, opts.projects, opts.inboxCwd);
      const key = loc.inbox ? INBOX_PIN : loc.path;
      const list = groups.get(key) ?? [];
      list.push(session);
      groups.set(key, list);
    }
    const keys = [...new Set([...opts.projects, ...groups.keys()])];
    const unique: string[] = [];
    for (const key of keys) {
      const n = key === INBOX_PIN ? INBOX_PIN : normalizeCwd(key);
      if (!unique.some((u) => (u === INBOX_PIN ? INBOX_PIN : normalizeCwd(u)) === n)) unique.push(key === INBOX_PIN ? INBOX_PIN : key);
    }
    unique.sort((a, b) => {
      const ap = a === INBOX_PIN ? 1 : pinSet.has(normalizeCwd(a)) ? 0 : 1;
      const bp = b === INBOX_PIN ? (pinSet.has(INBOX_PIN) ? 0 : 1) : pinSet.has(normalizeCwd(b)) ? 0 : 1;
      if (ap !== bp) return ap - bp;
      const an = a === INBOX_PIN ? "独立对话" : basename(a);
      const bn = b === INBOX_PIN ? "独立对话" : basename(b);
      return an.localeCompare(bn, "zh");
    });
    for (const key of unique) {
      const rows = groups.get(key) ?? [];
      if (rows.length === 0 && key !== INBOX_PIN && !opts.projects.some((p) => sameCwd(p, key))) continue;
      if (rows.length === 0) continue;
      sections.push({
        id: key === INBOX_PIN ? "inbox" : key,
        label: key === INBOX_PIN ? "独立对话" : basename(key),
        kind: "project",
        projectPath: key === INBOX_PIN ? undefined : key,
        rows: sortSessions(rows, opts.prefs.ordering, opts.titles).map((session) => toRow(opts, session, 0)),
      });
    }
    return sections;
  }

  if (opts.prefs.grouping === "updated") {
    const buckets = new Map<TimeBucket, SessionSummary[]>();
    for (const session of rest) {
      const b = timeBucket(session.updatedAt, opts.now);
      const list = buckets.get(b) ?? [];
      list.push(session);
      buckets.set(b, list);
    }
    for (const key of ["today", "yesterday", "week", "month", "older"] as TimeBucket[]) {
      const rows = buckets.get(key);
      if (!rows?.length) continue;
      const flat = flattenForks(sortSessions(rows, opts.prefs.ordering, opts.titles));
      sections.push({
        id: TIME_META[key].id,
        label: TIME_META[key].label,
        kind: "time",
        rows: flat.map(({ session, indent }) => toRow(opts, session, indent)),
      });
    }
    return sections;
  }

  const buckets = new Map<"needs-you" | "working" | "unread" | "other", SessionSummary[]>();
  for (const session of rest) {
    const b = statusBucket(opts.statusFor(session.id));
    const list = buckets.get(b) ?? [];
    list.push(session);
    buckets.set(b, list);
  }
  for (const key of ["needs-you", "working", "unread", "other"] as const) {
    const rows = buckets.get(key);
    if (!rows?.length) continue;
    const flat = flattenForks(sortSessions(rows, opts.prefs.ordering, opts.titles));
    sections.push({
      id: STATUS_META[key].id,
      label: STATUS_META[key].label,
      kind: "status",
      rows: flat.map(({ session, indent }) => toRow(opts, session, indent)),
    });
  }
  return sections;
}
```

For project grouping, nested forks still use `SessionBranch` in Task 5; `buildSidebarSections` may return a flat list per project. Task 5 will call `nestByParent` on `section.rows.map(r => r.session)` when `kind === "project"`. That is required so fork trees survive. Update the project-grouping test: order of `a` then `wt` is by `updatedAt` descending (`a` 11:00 before `wt` 26th). `Alpha` is 11:00 Aug 27, `Worktree` is Aug 26 — so `["a", "wt"]` is correct.

- [ ] **Step 4: Run tests to verify they pass**

Run: `npx vitest run src/lib/sidebar-list.test.ts`

Expected: PASS. If `formatTokenCount(1200)` is `1.2k`, the test matches. If timezone makes `timeBucket("2026-08-27T01:00:00.000Z")` not `today`, switch fixture timestamps to local-midnight-safe ISO via `new Date(now).toDateString()` in the test instead of hard-coded UTC.

- [ ] **Step 5: Commit (skip unless user asked)**

---

### Task 3: Review rail home + terminal + toggle restore

**Files:**
- Modify: `src/lib/review-rail.ts`
- Modify: `src/lib/review-rail.test.ts`
- Modify: `src/lib/tool-render.ts`
- Modify: `src/lib/tool-render.test.ts`

**Interfaces:**
- Consumes: existing reducer; `ChatItem` from `src/lib/chat.ts`; `classifyTool`
- Produces:
  - `ReviewTab` includes `"home" | "terminal"`
  - `RESTORE_ON_TOGGLE: ReadonlySet<ReviewTab>` containing `home`, `changes`, `files`, `preview`, `terminal`
  - `initialReviewState.tab === "home"`
  - `toggle` opens to `state.tab` if in `RESTORE_ON_TOGGLE`, else `"home"`
  - `deriveReviewTabs` takes `bashCount: number`; `home` always available count 0; `terminal` always available count `bashCount`
  - `bashTools(items: ChatItem[]): Array<Extract<ChatItem, { kind: "tool" }>>`

- [ ] **Step 1: Write the failing tests**

Replace the first test in `src/lib/review-rail.test.ts`:

```ts
it("defines home and terminal plus the six content tabs", () => {
  expect(REVIEW_TABS.map((tab) => tab.id)).toEqual([
    "home", "progress", "files", "changes", "context", "details", "preview", "terminal",
  ]);
});
```

Add:

```ts
it("opens the layout toggle onto home unless the last tab was a landing tile", () => {
  const fromProgress = reviewReducer({ ...initialReviewState, tab: "progress" }, { type: "toggle" });
  expect(fromProgress.open).toBe(true);
  expect(fromProgress.tab).toBe("home");
  const fromChanges = reviewReducer({ ...initialReviewState, open: false, tab: "changes" }, { type: "toggle" });
  expect(fromChanges.tab).toBe("changes");
});

it("keeps home and terminal available", () => {
  const tabs = deriveReviewTabs({
    planCount: 0, fileCount: 0, changeCount: 0, contextCount: 0,
    hasDetails: false, hasPreview: false, bashCount: 2,
  });
  expect(tabs.find((t) => t.id === "home")).toEqual({ id: "home", label: "首页", available: true, count: 0 });
  expect(tabs.find((t) => t.id === "terminal")).toEqual({ id: "terminal", label: "终端", available: true, count: 2 });
});
```

Update the `deriveReviewTabs` availability test: include `bashCount: 0` in the input object and expect extra home/terminal entries.

Update `initialReviewState` assertion if any test assumes `tab === "progress"`.

In `src/lib/tool-render.test.ts` add:

```ts
import type { ChatItem } from "./chat";
import { bashTools } from "./tool-render";

it("lists bash-classified tools", () => {
  const items: ChatItem[] = [
    { kind: "tool", id: "1", title: "Bash: ls", toolKind: "execute", status: "completed" },
    { kind: "tool", id: "2", title: "Read f", toolKind: "read", status: "completed" },
    { kind: "user", id: "3", text: "hi" },
  ];
  expect(bashTools(items).map((t) => t.id)).toEqual(["1"]);
});
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `npx vitest run src/lib/review-rail.test.ts src/lib/tool-render.test.ts`

Expected: FAIL on new tab ids / `bashTools`.

- [ ] **Step 3: Write minimal implementation**

In `src/lib/review-rail.ts`:

```ts
export type ReviewTab = "home" | "progress" | "files" | "changes" | "context" | "details" | "preview" | "terminal";

export const REVIEW_TABS: ReadonlyArray<{ id: ReviewTab; label: string }> = [
  { id: "home", label: "首页" },
  { id: "progress", label: "进度" },
  { id: "files", label: "文件" },
  { id: "changes", label: "改动" },
  { id: "context", label: "上下文" },
  { id: "details", label: "详情" },
  { id: "preview", label: "预览" },
  { id: "terminal", label: "终端" },
];

export const RESTORE_ON_TOGGLE: ReadonlySet<ReviewTab> = new Set(["home", "changes", "files", "preview", "terminal"]);
```

`ReviewData` add `bashCount: number`.

`deriveReviewTabs`:

```ts
export function deriveReviewTabs(data: ReviewData): ReviewTabState[] {
  const counts: Record<ReviewTab, number> = {
    home: 0,
    progress: data.planCount,
    files: data.fileCount,
    changes: data.changeCount,
    context: data.contextCount,
    details: data.hasDetails ? 1 : 0,
    preview: data.hasPreview ? 1 : 0,
    terminal: data.bashCount,
  };
  return REVIEW_TABS.map((tab) => ({
    ...tab,
    count: counts[tab.id],
    available:
      tab.id === "home" ||
      tab.id === "terminal" ||
      counts[tab.id] > 0 ||
      tab.id === "context" ||
      tab.id === "changes",
  }));
}
```

`initialReviewState.tab = "home"`.

Reducer `toggle`:

```ts
case "toggle":
  return state.open
    ? { ...state, open: false }
    : { ...state, open: true, tab: RESTORE_ON_TOGGLE.has(state.tab) ? state.tab : "home" };
```

`hydrate-legacy`: if `open` and the resolved tab is not in `RESTORE_ON_TOGGLE`, set `tab` to `"home"`.

Add `{ type: "home" }` action or reuse `{ type: "tab", tab: "home" }` for the back button. Task 6 will call `review.setTab("home")`. No new action required.

In `src/lib/tool-render.ts`:

```ts
import type { ChatItem } from "./chat";

export function bashTools(items: ChatItem[]): Extract<ChatItem, { kind: "tool" }>[] {
  return items.filter((item): item is Extract<ChatItem, { kind: "tool" }> =>
    item.kind === "tool" && classifyTool(item.title, item.toolKind) === "bash",
  );
}
```

Fix every `deriveReviewTabs({...})` call in tests and later in `App.tsx` (Task 9) to pass `bashCount`.

- [ ] **Step 4: Run tests to verify they pass**

Run: `npx vitest run src/lib/review-rail.test.ts src/lib/tool-render.test.ts src/hooks/useReviewController.test.ts`

Expected: PASS

- [ ] **Step 5: Commit (skip unless user asked)**

---

### Task 4: Palette empty-enter and settings search

**Files:**
- Modify: `src/lib/palette.ts`
- Modify: `src/lib/palette.test.ts`
- Create: `src/lib/settings-search.ts`
- Create: `src/lib/settings-search.test.ts`

**Interfaces:**
- Consumes: `PaletteItem`
- Produces:
  - `paletteSubmit(query: string, hits: PaletteItem[], index: number): { kind: "pick"; id: string } | { kind: "search"; query: string } | { kind: "none" }`
  - `settingRowVisible(title: string, description: string, query: string): boolean`

- [ ] **Step 1: Write the failing tests**

`src/lib/palette.test.ts`:

```ts
import { paletteSubmit } from "./palette";

describe("paletteSubmit", () => {
  it("picks the highlighted hit", () => {
    expect(paletteSubmit("x", ITEMS, 0)).toEqual({ kind: "pick", id: ITEMS[0].id });
  });

  it("searches when there is no hit and the query is long enough", () => {
    expect(paletteSubmit("ab", [], 0)).toEqual({ kind: "search", query: "ab" });
    expect(paletteSubmit("a", [], 0)).toEqual({ kind: "none" });
  });
});
```

`src/lib/settings-search.test.ts`:

```ts
import { describe, expect, it } from "vitest";
import { settingRowVisible } from "./settings-search";

describe("settingRowVisible", () => {
  it("shows every row when the query is empty", () => {
    expect(settingRowVisible("发送快捷键", "Enter 发送", "")).toBe(true);
  });

  it("matches title or description, case insensitive", () => {
    expect(settingRowVisible("发送快捷键", "Enter 发送", "enter")).toBe(true);
    expect(settingRowVisible("外观", "主题", "xyz")).toBe(false);
  });
});
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `npx vitest run src/lib/palette.test.ts src/lib/settings-search.test.ts`

Expected: FAIL

- [ ] **Step 3: Write minimal implementation**

`src/lib/palette.ts`:

```ts
export function paletteSubmit(
  query: string,
  hits: PaletteItem[],
  index: number,
): { kind: "pick"; id: string } | { kind: "search"; query: string } | { kind: "none" } {
  const hit = hits[index];
  if (hit) return { kind: "pick", id: hit.id };
  const q = query.trim();
  if (q.length >= 2) return { kind: "search", query: q };
  return { kind: "none" };
}
```

`src/lib/settings-search.ts`:

```ts
export function settingRowVisible(title: string, description: string, query: string): boolean {
  const q = query.trim().toLowerCase();
  if (!q) return true;
  return title.toLowerCase().includes(q) || description.toLowerCase().includes(q);
}
```

- [ ] **Step 4: Run tests to verify they pass**

Run: `npx vitest run src/lib/palette.test.ts src/lib/settings-search.test.ts`

Expected: PASS

- [ ] **Step 5: Commit (skip unless user asked)**

---

### Task 5: Sidebar chrome, list menu, account menu

**Files:**
- Create: `src/components/AccountMenu.tsx`
- Create: `src/components/SidebarListMenu.tsx`
- Modify: `src/components/Sidebar.tsx`
- Modify: `src/components/SessionBranch.tsx`
- Modify: `src/icons.tsx` (add `IconFilter` wrapping `Filter`, `IconTerminal` wrapping `Terminal`, both from `@icon-park/react`)

**Interfaces:**
- Consumes: `SidebarSection`, `SidebarListPrefs`, `INBOX_PIN` from Task 2; `DoctorInfo`
- Produces: Sidebar UI only. Props listed below must be used by Task 9.

New `Sidebar` props (replace `search` / `listView` / `inboxPinned` / `tree`):

```ts
export type SidebarProps = {
  sections: SidebarSection[];
  prefs: SidebarListPrefs;
  onPrefs: (next: SidebarListPrefs) => void;
  onSearch: () => void;
  searchHits: SessionSearchHit[] | null;
  onOpenHit: (sessionId: string) => void;
  onClearHits: () => void;
  openProjects: Record<string, boolean>;
  onToggleProject: (path: string) => void;
  onPinProject: (path: string) => void;
  sessionId: string | null;
  splitId?: string;
  titles: Record<string, string>;
  expandedIds: Set<string>;
  collapsedIds: Set<string>;
  onToggleExpand: (id: string, currentlyOpen: boolean) => void;
  onOpenSession: (s: SessionSummary) => void;
  onSessionMenu: (id: string, el: HTMLElement) => void;
  onNewChat: () => void;
  onAddProject: () => void;
  picking: boolean;
  statusFor: (id: string) => SessionStatus;
  width: number;
  collapsed?: boolean;
  onToggleCollapsed?: () => void;
  signedIn: boolean;
  onSettings: () => void;
  onExtensions: () => void;
  onShortcuts: () => void;
  onCollapseAll: () => void;
  onMarkAllRead: () => void;
  showTokens: boolean;
  showStatus: boolean;
  showWorktree: boolean;
};
```

- [ ] **Step 1: Write a failing structural test for menu prefs**

There is no component test runner. Cover the exclusive grouping toggle as a pure helper in `SidebarListMenu` by exporting `applyGrouping(prefs, grouping)` from `src/lib/sidebar-list.ts`:

```ts
export function applyGrouping(prefs: SidebarListPrefs, grouping: SidebarGrouping): SidebarListPrefs {
  return { ...prefs, grouping };
}
export function toggleShow(prefs: SidebarListPrefs, key: "showTokens" | "showStatus" | "showWorktree"): SidebarListPrefs {
  return { ...prefs, [key]: !prefs[key] };
}
export function toggleStatusFilter(prefs: SidebarListPrefs, flag: StatusFilter): SidebarListPrefs {
  const has = prefs.statusFilter.includes(flag);
  return { ...prefs, statusFilter: has ? prefs.statusFilter.filter((x) => x !== flag) : [...prefs.statusFilter, flag] };
}
```

Add tests in `sidebar-list.test.ts` for these three functions (toggle on/off). Run to fail, then implement (they are one-liners).

- [ ] **Step 2: Run the new helper tests — fail then pass after implementing the three functions**

Run: `npx vitest run src/lib/sidebar-list.test.ts`

- [ ] **Step 3: Implement components**

`AccountMenu.tsx`: popup anchored above the footer. Buttons: 设置 → `onSettings`, 扩展中心 → `onExtensions`, 快捷键 → `onShortcuts`. Identity text `已登录` / `未登录`. Close on outside click and Escape.

`SidebarListMenu.tsx`: nested menus matching the spec table. Call `onPrefs(applyGrouping(...))` etc. Filters section has Reset (`onPrefs({ ...prefs, statusFilter: [], includeArchived: false })`). Actions call `onCollapseAll` / `onMarkAllRead`.

`Sidebar.tsx` layout:

1. `data-tauri-drag-region` traffic row: only collapse chevron (no gear, theme, plug).
2. Two text rows: 新对话, 搜索 (`onSearch`).
3. Optional 搜索结果 list from `searchHits` with a clear control.
4. Heading 工作区 + filter button opening `SidebarListMenu`.
5. Map `sections`. For `kind === "project"` render `SessionBranch` via `nestByParent(section.rows.map(r => r.session))` and a project header with pin. For other kinds render flat rows from `section.rows`.
6. Footer add-project plus.
7. `AccountMenu` at the bottom.

`SessionBranch`: add optional `subtitle?: string`, `token?: number`, `worktree?: string`, `showStatus?: boolean`, `showTokens?: boolean`. When `showStatus === false`, do not render `SessionLeading` except working matrix may stay off too (spec: no glyph). Show subtitle under title. Show token with `formatTokenCount` when `showTokens` and token is not `undefined`. Show worktree when provided.

Look up extras from a `Map<id, SidebarRow>` passed as `rowMeta`.

- [ ] **Step 4: Typecheck**

Run: `npx tsc -b --pretty false`

Expected: FAIL until Task 9 updates `App.tsx`. That is OK if you temporarily keep old Sidebar props compiling by implementing the new props and updating App in the same sitting as Task 9. **Prefer finishing Task 9 next in the same session so `tsc` is not left red.**

- [ ] **Step 5: Commit (skip unless user asked)**

---

### Task 6: Right pane landing, terminal panel, rail header

**Files:**
- Create: `src/components/ReviewHome.tsx`
- Modify: `src/components/ReviewRail.tsx`

**Interfaces:**
- Consumes: `ReviewTab`, `bashTools` results passed as props; `openInTerminal` is called from App, not from ReviewHome
- Produces: `ReviewHome` tiles fire `onOpen("changes" | "files" | "preview" | "terminal")`. `ReviewRail` gets `onHome: () => void` and hides `.review-tabs` when `activeTab === "home"`.

- [ ] **Step 1: No new pure-function tests** (covered in Task 3). Manual check list is Task 10.

- [ ] **Step 2: Implement ReviewHome**

```tsx
import { IconBranch, IconFolder, IconFinder, IconTerminal } from "../icons";

export type ReviewHomeProps = {
  onOpen: (tab: "changes" | "files" | "preview" | "terminal") => void;
};

export function ReviewHome({ onOpen }: ReviewHomeProps) {
  const tiles = [
    { id: "changes" as const, label: "改动", Icon: IconBranch },
    { id: "files" as const, label: "文件", Icon: IconFolder },
    { id: "preview" as const, label: "预览", Icon: IconFinder },
    { id: "terminal" as const, label: "终端", Icon: IconTerminal },
  ];
  return (
    <div className="review-home">
      {tiles.map((t) => (
        <button key={t.id} type="button" className="review-tile" onClick={() => onOpen(t.id)}>
          <t.Icon size={22} />
          {t.label}
        </button>
      ))}
    </div>
  );
}
```

Export `IconTerminal` from `src/icons.tsx` with `wrap(Terminal)` (already imported in Task 5).

- [ ] **Step 3: Implement terminal body in App (Task 9) and ReviewRail chrome now**

`ReviewRail.tsx` header:

```tsx
<header className="review-head">
  {activeTab !== "home" ? (
    <button type="button" className="icon-btn" onClick={onHome} aria-label="返回入口">返回</button>
  ) : null}
  <strong>{activeTab === "home" ? "审阅" : tabs.find(t => t.id === activeTab)?.label ?? "审阅"}</strong>
  <button type="button" className="icon-btn" onClick={onClose} aria-label="关闭审阅" title="关闭审阅">
    <IconClose size={14} />
  </button>
</header>
{activeTab !== "home" ? (existing tablist) : null}
```

Add `onHome: () => void` to props. Filter tablist to exclude `home`.

When `activeTab === "home"`, render `children.home` in `.review-body`.

- [ ] **Step 4: `npx tsc -b` after Task 9 wires `home` and `terminal` children.**

- [ ] **Step 5: Commit (skip unless user asked)**

---

### Task 7: Composer workspace chips and empty state

**Files:**
- Modify: `src/components/Composer.tsx`
- Modify: `src/components/EmptyState.tsx`

**Interfaces:**
- Consumes: `lastWorkspace` resolution from Task 1
- Produces: Composer props:
  - `workspaceLabel: string`
  - `workspaceOptions: Array<{ path: string; label: string }>`
  - `onWorkspace: (path: string) => void`
  Render chips above the textarea: button `workspaceLabel` (menu of options) and a non-interactive `本机` chip.

EmptyState: if CLI missing or auth missing, keep those steps. If no project and no cwd, keep 选择项目文件夹. Otherwise render `null` (composer is the empty UI). App should stop passing a large `emptyTitle` when healthy.

- [ ] **Step 1: No new lib tests.**

- [ ] **Step 2: Implement chips** in `Composer.tsx` immediately inside `.composer`, above `<textarea>`:

```tsx
<div className="composer-chips">
  <div className="chip-wrap">
    <button type="button" className="cwd-chip" aria-haspopup="listbox" onClick={() => setWsOpen((o) => !o)}>
      {workspaceLabel}
      <IconChevron size={12} />
    </button>
    {wsOpen ? (
      <div className="chip-menu" role="listbox">
        {workspaceOptions.map((o) => (
          <button key={o.path} type="button" onClick={() => { onWorkspace(o.path); setWsOpen(false); }}>
            {o.label}
          </button>
        ))}
      </div>
    ) : null}
  </div>
  <span className="cwd-chip local-chip">本机</span>
</div>
```

Add local state `wsOpen` next to other chip menus. Guard: if `workspaceOptions` is omitted, skip chips (split pane can omit).

- [ ] **Step 3: Slim EmptyState** — only blockers; default branch returns `null`.

- [ ] **Step 4: Typecheck with Task 9.**

- [ ] **Step 5: Commit (skip unless user asked)**

---

### Task 8: Settings overlay cards, search, shortcuts focus

**Files:**
- Modify: `src/Settings.tsx`
- Modify: `src/styles.css` (settings cards)

**Interfaces:**
- Consumes: `settingRowVisible`
- Produces: props `query` internal state; `focusSection?: "shortcuts" | null`; `onConsumedFocus?: () => void`

- [ ] **Step 1: No new tests beyond Task 4.**

- [ ] **Step 2: Add search input** at top of `.settings-nav`. Filter each `.set-row` / `.set-stack` by wrapping with:

```tsx
{settingRowVisible("发送快捷键", "Enter 发送或 ⌘Enter", settingsQuery) ? (existing row) : null}
```

Use the visible label as `title` and the hint/description as `description`. When the query is non-empty and a tab would have zero visible rows, still show the tab but empty pane copy `没有匹配的设置`.

- [ ] **Step 3: Card layout** — wrap each logical group in `<div className="set-card">`. Keep the five tabs. 快捷键: `useEffect` if `focusSection === "shortcuts"` then `setTab("chat")` and `document.getElementById("settings-shortcuts")?.scrollIntoView()` then `onConsumedFocus?.()`. Put `id="settings-shortcuts"` on the `ShortcutsTable` wrapper.

Remove any Log Out footer if present (none today). Keep 总览 CLI login copy.

- [ ] **Step 4: Typecheck after App passes `focusSection`.**

- [ ] **Step 5: Commit (skip unless user asked)**

---

### Task 9: Wire App.tsx

**Files:**
- Modify: `src/App.tsx`
- Modify: `src/components/CommandPalette.tsx`
- Modify: `src/hooks/useReviewController.ts` only if `toggle` signature stays (`defaultTab` unused is fine)

**Interfaces:**
- Consumes: all previous tasks
- Produces: working shell. Session routing functions (`createAcpSession`, `resumeSession`, `answerPermission`) stay as they are.

- [ ] **Step 1: Persist fields**

State:

```ts
const [lastWorkspace, setLastWorkspace] = useState("");
const [pinnedProjects, setPinnedProjects] = useState<string[]>([]);
const [sessionTokens, setSessionTokens] = useState<Record<string, number>>({});
const [sidebarList, setSidebarList] = useState(DEFAULT_SIDEBAR_LIST);
const [settingsFocus, setSettingsFocus] = useState<"shortcuts" | null>(null);
const [accountOpen, setAccountOpen] = useState(false);
```

Hydrate from `loadWebuiState` with `loadSidebarList(state.sidebarList)`, prune pins/tokens.

Include the new fields in `persist()` deps and object. When `chat.usage?.used` is finite and `sessionId` is set, merge `sessionTokens: { ...sessionTokens, [sessionId]: chat.usage.used }`.

Remove `listView` / `search` controlled field (keep `searchHits` only).

- [ ] **Step 2: New chat uses last workspace**

```ts
async function startNewChat() {
  const work = resolveLastWorkspace(lastWorkspace, projects, inboxCwd);
  if (!work || (inboxCwd && sameCwd(work, inboxCwd))) {
    await startInboxSession();
    return;
  }
  await startSession(work);
}
```

On `resumeSession`, `selectProject`, and composer `onWorkspace`: `setLastWorkspace(path === INBOX_PIN ? INBOX_PIN : path); persist({ lastWorkspace: ... })`. Composer inbox option uses `INBOX_PIN`.

`onNewChat={() => void startNewChat()}`.

- [ ] **Step 3: Build sections**

```ts
const sidebarSections = useMemo(
  () => buildSidebarSections({
    sessions: allSessions,
    projects,
    inboxCwd,
    pinned,
    pinnedProjects,
    archived,
    autoArchiveDays,
    now: clock,
    prefs: sidebarList,
    titles,
    statusFor,
    sessionTokens,
  }),
  [allSessions, projects, inboxCwd, pinned, pinnedProjects, archived, autoArchiveDays, clock, sidebarList, titles, statusFor, sessionTokens],
);
```

`onCollapseAll`: set `openProjects` all false and add every nested parent id to `collapsedIds`.

`onMarkAllRead`: `setUnread({}); persist({ unread: {} })`.

Hotkeys `visibleHotkeySessions`: first 9 ids from flattened `sidebarSections`.

- [ ] **Step 4: Review children**

```ts
deriveReviewTabs({ ..., bashCount: bashTools(chat.items).length })
```

Pass:

```tsx
home: <ReviewHome onOpen={(tab) => review.setTab(tab)} />,
terminal: (
  <div className="review-stack">
    <button type="button" className="btn primary" disabled={!cwd} onClick={() => {
      if (!cwd) return;
      void openInTerminal(cwd).catch((e) => showToast(String(e)));
    }}>在终端打开项目</button>
    {bashTools(chat.items).length === 0 ? (
      <p className="float-empty">本会话还没有终端工具输出</p>
    ) : bashTools(chat.items).map((tool) => (
      <button key={tool.id} type="button" className="file-item" onClick={() => review.inspectTool(tool)}>{tool.title}</button>
    ))}
  </div>
),
```

Layout button stays; `review.toggle()` without relying on `defaultRail` for the tab (reducer handles restore). Import `openInTerminal` from `./api`.

`ReviewRail onHome={() => review.setTab("home")}`.

- [ ] **Step 5: Command palette**

`CommandPalette` props add `onSearch: (query: string) => void`. On Enter:

```ts
const result = paletteSubmit(query, hits, index);
if (result.kind === "pick") onPick(result.id);
if (result.kind === "search") onSearch(result.query);
```

App `onSearch`: `searchSessionText(query).then(hits => { setSearchHits(hits); setPaletteOpen(false); if (hits.length === 1) resume that session })`.

- [ ] **Step 6: Settings**

```tsx
<SettingsPanel
  focusSection={settingsFocus}
  onConsumedFocus={() => setSettingsFocus(null)}
  ...
/>
```

Account: `onShortcuts={() => { setSettingsOpen(true); setSettingsFocus("shortcuts"); }}`, `onExtensions={() => { setSettingsOpen(false); /* existing hub open */ }}`.

- [ ] **Step 7: Run**

Run: `npx vitest run`

Expected: PASS (fix any `deriveReviewTabs` call sites in tests that omit `bashCount`).

Run: `npx tsc -b --pretty false`

Expected: PASS

- [ ] **Step 8: Commit (skip unless user asked)**

---

### Task 10: Visual language, PRODUCT.md, README, manual pass

**Files:**
- Modify: `src/styles.css`
- Modify: `design/grok-build-desktop/PRODUCT.md`
- Modify: `README.md`

**Interfaces:** none new.

- [ ] **Step 1: CSS** — add, do not replace the token block. Keep `--font: Inter`. Raise `--radius-m` usage on composer to 16px via `.composer { border-radius: 16px; box-shadow: var(--shadow); }`.

Required new rules (copy verbatim):

```css
.side-link {
  display: flex;
  align-items: center;
  gap: 10px;
  width: 100%;
  border: 0;
  background: transparent;
  padding: 8px 10px;
  border-radius: 10px;
  color: var(--text);
  font-size: 13.5px;
}
.side-link:hover { background: var(--bg-hover); }
.account-row {
  display: flex;
  align-items: center;
  gap: 10px;
  padding: 10px 12px;
  border-top: 1px solid var(--line);
}
.account-avatar {
  width: 28px; height: 28px; border-radius: 50%;
  background: var(--bg-hover); display: grid; place-items: center;
  font-size: 12px;
}
.review-home {
  display: grid;
  grid-template-columns: 1fr 1fr;
  gap: 12px;
  padding: 18px;
}
.review-tile {
  display: flex; flex-direction: column; align-items: center; justify-content: center;
  gap: 8px; min-height: 88px; border: 0; border-radius: 14px;
  background: var(--bg); box-shadow: var(--shadow); color: var(--text);
}
.set-card {
  background: var(--bg-alt);
  border-radius: 14px;
  padding: 4px 12px;
  margin: 0 0 16px;
}
.composer-chips { display: flex; gap: 8px; margin-bottom: 8px; align-items: center; }
.local-chip { pointer-events: none; opacity: 0.7; }
.sess-sub { display: block; font-size: 11px; color: var(--muted); font-weight: 400; }
.sess-token { font-variant-numeric: tabular-nums; font-size: 11px; color: var(--faint); }
```

Restyle `.palette` to 16px radius and match `.menu` shadow. Remove unused `.search-field` rules only if no remaining markup uses them.

- [ ] **Step 2: PRODUCT.md**

Replace the last non-goal bullet and P1 IA with:

```markdown
- 完整 IDE 式多列常驻布局。右侧审阅栏由用户显隐，打开后先显示改动 / 文件 / 预览 / 终端入口，不是编辑器+浏览器+PTY。

## P1 information architecture (current)

- 左侧会话列表默认按项目分组；用户可改为按更新时间或状态，并可配置排序、置顶（会话与项目）、显示 token / 状态 / worktree。
- 侧栏顶部只有新对话和搜索（搜索打开命令面板）。设置、扩展中心、快捷键在账号菜单。
- 主会话右侧仍是唯一审阅栏，可关闭。打开且无对话跳转时显示四宫格入口；进度 / 上下文 / 详情仍由对话内动作打开。
- 分屏模式保持会话优先，审阅栏关闭且不可用；不会改变 ACP/session 运行语义。
- 设置中的「扩展」是通往扩展中心的单一入口，不维护第二套 MCP 开关。
```

- [ ] **Step 3: README.md** — under Core workflow, add bullets: 工作区列表可分组/筛选/置顶项目; 账号菜单进入设置与扩展; 审阅栏四宫格入口（终端为系统终端 + 本会话 bash 工具）。

- [ ] **Step 4: Manual pass** (dev: `npm run tauri dev`)

1. Empty hero: centered composer, project chip, 本机.
2. List: default project groups; switch grouping in the 工作区 menu; pin a session and a project.
3. Show toggles: status / token / worktree.
4. Search row opens palette; unmatched 2+ char Enter runs session text search; hits appear at top of sidebar.
5. Account menu: 设置 / 扩展中心 / 快捷键 (scrolls to shortcuts).
6. Layout button opens four tiles; 终端 lists bash tools and 在终端打开项目; Back returns to tiles; conversation preview still jumps to 预览.
7. Settings cards + 搜索设置.
8. Light and dark.
9. Split still hides the right pane.

- [ ] **Step 5: Commit (skip unless user asked)**

---

## Spec coverage

| Spec section | Task |
|---|---|
| Persistence / defaults / prune | 1 |
| Grouping, pin, filters, row extras, tokens cache write | 2, 9 |
| Right pane tabs, toggle restore, terminal not PTY | 3, 6, 9 |
| Search via palette, settings search | 4, 8, 9 |
| Sidebar chrome, account menu, list menu | 5 |
| Landing 2×2 | 6 |
| Composer chips, empty blockers only | 7 |
| Settings cards, shortcuts focus | 8 |
| App wiring, new chat cwd, openInTerminal | 9 |
| Visual language, PRODUCT/README | 10 |
| No PTY / browser / PR filters / ACP rewrite | Global constraints |
| Split closes rail | existing App + Task 9 does not change split |

## Notes for implementers

- `formatTokenCount(1200)` must be `1.2k` (one decimal).
- `timeBucket` uses **local** midnight of `now`. Tests should construct ISO strings from that local calendar, not assume UTC equals local.
- Project grouping still nests forks in the UI via `nestByParent`; `buildSidebarSections` may return unordered-by-parent rows — `SessionBranch` re-nests.
- Do not batch `readSessionUsage`.
- Skip commits unless the user asked.
