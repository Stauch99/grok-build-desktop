import type { SessionSummary } from "../api";
import { agentChipLabel } from "./agent-chip";
import type { AgentId } from "./agent-id";
import { sameCwd, normalizeCwd } from "./inbox";
import { displayTitle } from "./projects";
import { visibleSessions, partitionPinned } from "./session-chrome";
import { agentIdOfSession } from "./session-agent";
import type { SessionStatus } from "./session-status";
import { basename } from "./text";

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

export function applyGrouping(prefs: SidebarListPrefs, grouping: SidebarGrouping): SidebarListPrefs {
  return { ...prefs, grouping };
}

export function toggleShow(
  prefs: SidebarListPrefs,
  key: "showTokens" | "showStatus" | "showWorktree",
): SidebarListPrefs {
  return { ...prefs, [key]: !prefs[key] };
}

export function toggleStatusFilter(prefs: SidebarListPrefs, flag: StatusFilter): SidebarListPrefs {
  const has = prefs.statusFilter.includes(flag);
  return {
    ...prefs,
    statusFilter: has ? prefs.statusFilter.filter((x) => x !== flag) : [...prefs.statusFilter, flag],
  };
}

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

/** Empty imported CLI rows must not call setWorkspace(""). */
export function resumeWorkspaceCwd(cwd: string | undefined | null): string | null {
  const next = (cwd ?? "").trim();
  return next ? next : null;
}

/** Opening a row with no cwd must not wipe lastWorkspace (breaks 新对话). */
export function lastWorkspaceAfterOpen(sessionCwd: string, inboxCwd: string, currentLast: string): string {
  const cwd = sessionCwd.trim();
  if (!cwd) return currentLast;
  if (cwd === INBOX_PIN || (inboxCwd && sameCwd(cwd, inboxCwd))) return INBOX_PIN;
  return cwd;
}

export function projectForSession(cwd: string, projectPaths: string[], inboxCwd: string): { path: string; inbox: boolean } {
  if (inboxCwd && sameCwd(cwd, inboxCwd)) return { path: INBOX_PIN, inbox: true };
  const matches = projectPaths.filter((p) => sameCwd(cwd, p) || normalizeCwd(cwd).startsWith(normalizeCwd(p) + "/"));
  matches.sort((a, b) => normalizeCwd(b).length - normalizeCwd(a).length);
  if (matches[0]) return { path: matches[0], inbox: false };
  return { path: INBOX_PIN, inbox: true };
}

/** Inbox chats plus sessions whose cwd is an added project (or a worktree under it). */
export function sessionInLibrary(cwd: string, projectPaths: string[], inboxCwd: string): boolean {
  const n = (cwd ?? "").trim();
  if (!n) return false;
  if (inboxCwd && sameCwd(n, inboxCwd)) return true;
  return projectPaths.some((p) => sameCwd(n, p) || normalizeCwd(n).startsWith(normalizeCwd(p) + "/"));
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
  kind: "pin" | "project" | "inbox" | "time" | "status";
  band?: SidebarBandId;
  projectPath?: string;
  rows: SidebarRow[];
};

export type SidebarBandId = "pin" | "projects" | "inbox";

export const SIDEBAR_BAND_LABEL: Record<SidebarBandId, string> = {
  pin: "置顶",
  projects: "项目",
  inbox: "独立对话",
};

export type SidebarBand = {
  id: string;
  label: string;
  sections: SidebarSection[];
};

export function isSidebarBandId(id: string): id is SidebarBandId {
  return id === "pin" || id === "projects" || id === "inbox";
}

function sidebarBandVisible(band: SidebarBand): boolean {
  if (!band.sections.length) return false;
  if (band.id === "inbox") return band.sections.some((s) => s.rows.length > 0);
  if (band.id === "pin") {
    return band.sections.some((s) => s.kind === "project" || s.rows.length > 0);
  }
  return true;
}

export function visibleSidebarBands(bands: readonly SidebarBand[]): SidebarBand[] {
  return bands.filter(sidebarBandVisible);
}

/** Collapse consecutive sections that share a band into one labeled partition. */
export function groupSidebarBands(sections: readonly SidebarSection[]): SidebarBand[] {
  const out: SidebarBand[] = [];
  for (const section of sections) {
    if (section.band) {
      const last = out[out.length - 1];
      if (last && last.id === section.band) {
        last.sections.push(section);
      } else {
        out.push({
          id: section.band,
          label: SIDEBAR_BAND_LABEL[section.band],
          sections: [section],
        });
      }
    } else {
      out.push({ id: section.id, label: section.label, sections: [section] });
    }
  }
  return visibleSidebarBands(out);
}

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
  const members = opts.sessions.filter((s) => sessionInLibrary(s.cwd, opts.projects, opts.inboxCwd));
  const chrome = {
    pinned: opts.pinned,
    archived: opts.archived,
    autoArchiveDays: opts.autoArchiveDays,
    now: opts.now,
  };
  const active = visibleSessions(members, { ...chrome, view: "active" });
  if (!opts.prefs.includeArchived) return active;
  const archived = visibleSessions(members, { ...chrome, view: "archived" });
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
      band: "pin",
      rows: sortSessions(pinned, opts.prefs.ordering, opts.titles).map((session) => toRow(opts, session, 0)),
    });
  }

  if (opts.prefs.grouping === "project") {
    const pinSet = new Set(opts.pinnedProjects.map((p) => (p === INBOX_PIN ? INBOX_PIN : normalizeCwd(p))));
    const groups = new Map<string, SessionSummary[]>();
    const inboxRows: SessionSummary[] = [];
    for (const session of rest) {
      const loc = projectForSession(session.cwd, opts.projects, opts.inboxCwd);
      if (loc.inbox) {
        inboxRows.push(session);
        continue;
      }
      const list = groups.get(loc.path) ?? [];
      list.push(session);
      groups.set(loc.path, list);
    }
    const keys = [...new Set([...opts.projects, ...groups.keys()])];
    const unique: string[] = [];
    for (const key of keys) {
      if (key === INBOX_PIN) continue;
      const n = normalizeCwd(key);
      if (!unique.some((u) => normalizeCwd(u) === n)) unique.push(key);
    }
    function pinRank(key: string): number {
      return pinSet.has(normalizeCwd(key)) ? 0 : 1;
    }
    unique.sort((a, b) => {
      const ap = pinRank(a);
      const bp = pinRank(b);
      if (ap !== bp) return ap - bp;
      return basename(a).localeCompare(basename(b), "zh");
    });
    for (const key of unique) {
      const rows = groups.get(key) ?? [];
      const pinnedProj = pinSet.has(normalizeCwd(key));
      if (rows.length === 0 && !pinnedProj) continue;
      if (rows.length === 0 && !opts.projects.some((p) => sameCwd(p, key))) continue;
      sections.push({
        id: key,
        label: basename(key),
        kind: "project",
        band: pinnedProj ? "pin" : "projects",
        projectPath: key,
        rows: sortSessions(rows, opts.prefs.ordering, opts.titles).map((session) => toRow(opts, session, 0)),
      });
    }
    if (inboxRows.length) {
      sections.push({
        id: "inbox",
        label: "独立对话",
        kind: "inbox",
        band: "inbox",
        rows: sortSessions(inboxRows, opts.prefs.ordering, opts.titles).map((session) => toRow(opts, session, 0)),
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

export function sessionAgentPill(agentId?: string | null): {
  agentId: AgentId;
  label: string;
  className: string;
} {
  const id = agentIdOfSession({ agentId });
  return {
    agentId: id,
    label: agentChipLabel(id),
    className: `sess-agent sess-agent-${id}`,
  };
}
