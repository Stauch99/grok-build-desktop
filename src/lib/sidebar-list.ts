import type { SessionSummary } from "../api";
import { agentChipLabel } from "./agent-chip";
import type { AgentId } from "./agent-id";
import { sameCwd, normalizeCwd } from "./inbox";
import { displayTitle } from "./projects";
import { compareByUpdatedAtDesc, updatedAtMs } from "./session-time";
import { visibleSessions, partitionPinned } from "./session-chrome";
import { agentIdOfSession } from "./session-agent";
import type { SessionStatus } from "./session-status";
import { basename } from "./text";
import { tr } from "./i18n-bridge";
import { EMPTY_PROJECT_GROUPS, groupBandId, groupIdFor, type ProjectGroupState } from "./project-groups";

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

/** Ignore leftover usage still sitting on chat when the bound session id just changed. */
export function sessionTokensAfterLiveUsage(
  prev: Record<string, number>,
  sessionId: string | null,
  used: number | undefined,
): Record<string, number> | null {
  if (!sessionId || typeof used !== "number" || !Number.isFinite(used)) return null;
  if (prev[sessionId] === used) return null;
  for (const [id, n] of Object.entries(prev)) {
    if (id !== sessionId && n === used) return null;
  }
  return { ...prev, [sessionId]: used };
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
  const t = updatedAtMs(iso);
  if (t <= 0) return "older";
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
  kind: "pin" | "project" | "inbox" | "time" | "status" | "group";
  band?: string;
  projectPath?: string;
  groupId?: string;
  groupLabel?: string;
  rows: SidebarRow[];
};

export type SidebarBandId = "pin" | "projects" | "inbox";

export const SIDEBAR_BAND_LABEL: Record<SidebarBandId, string> = {
  pin: "sidebar.pin",
  projects: "sidebar.projects",
  inbox: "sidebar.inbox",
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
          label: isSidebarBandId(section.band) ? tr(SIDEBAR_BAND_LABEL[section.band]) : (section.groupLabel ?? section.label),
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
  projectGroups?: ProjectGroupState;
  preview?: Record<string, string>;
};

const TIME_META: Record<TimeBucket, { id: string; label: string }> = {
  today: { id: "today", label: "sidebar.bandToday" },
  yesterday: { id: "yesterday", label: "sidebar.bandYesterday" },
  week: { id: "week", label: "sidebar.bandWeek" },
  month: { id: "month", label: "sidebar.bandMonth" },
  older: { id: "older", label: "sidebar.bandOlder" },
};

const STATUS_META: Record<"needs-you" | "working" | "unread" | "other", { id: string; label: string }> = {
  "needs-you": { id: "needs-you", label: "sidebar.bandNeedsYou" },
  working: { id: "working", label: "sidebar.bandWorking" },
  unread: { id: "unread", label: "sidebar.bandUnread" },
  other: { id: "other", label: "sidebar.bandOther" },
};

function sortSessions(
  rows: SessionSummary[],
  ordering: SidebarOrdering,
  titles: Record<string, string>,
  preview?: Record<string, string>,
): SessionSummary[] {
  const copy = [...rows];
  if (ordering === "title") {
    copy.sort((a, b) => {
      const byTitle = displayTitle(a, titles, preview).localeCompare(displayTitle(b, titles, preview), "zh");
      return byTitle !== 0 ? byTitle : a.id.localeCompare(b.id);
    });
  } else {
    copy.sort(compareByUpdatedAtDesc);
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
  const subtitle = loc.inbox ? tr("sidebar.inbox") : basename(loc.path);
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
      label: tr("sidebar.pin"),
      kind: "pin",
      band: "pin",
      rows: sortSessions(pinned, opts.prefs.ordering, opts.titles, opts.preview).map((session) => toRow(opts, session, 0)),
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
    const groupState = opts.projectGroups ?? EMPTY_PROJECT_GROUPS;
    function byName(a: string, b: string): number {
      return basename(a).localeCompare(basename(b), "zh");
    }
    function emitProject(
      key: string,
      band: string,
      group?: { id: string; name: string },
    ) {
      const rows = groups.get(key) ?? [];
      const pinnedProj = pinSet.has(normalizeCwd(key));
      if (rows.length === 0 && !pinnedProj && !group) return;
      if (rows.length === 0 && !opts.projects.some((p) => sameCwd(p, key))) return;
      sections.push({
        id: key,
        label: basename(key),
        kind: "project",
        band,
        projectPath: key,
        groupId: group?.id,
        groupLabel: group?.name,
        rows: sortSessions(rows, opts.prefs.ordering, opts.titles, opts.preview).map((session) => toRow(opts, session, 0)),
      });
    }

    const pinnedKeys = unique.filter((key) => pinSet.has(normalizeCwd(key))).sort(byName);
    const groupedKeys = new Set<string>();
    for (const key of unique) {
      if (pinSet.has(normalizeCwd(key))) continue;
      const gid = groupIdFor(groupState, key);
      if (gid) groupedKeys.add(key);
    }

    for (const key of pinnedKeys) emitProject(key, "pin");

    for (const group of groupState.groups) {
      const members = unique
        .filter((key) => !pinSet.has(normalizeCwd(key)) && groupIdFor(groupState, key) === group.id)
        .sort(byName);
      if (members.length === 0) {
        sections.push({
          id: groupBandId(group.id),
          label: group.name,
          kind: "group",
          band: groupBandId(group.id),
          groupId: group.id,
          groupLabel: group.name,
          rows: [],
        });
        continue;
      }
      for (const key of members) emitProject(key, groupBandId(group.id), group);
    }

    const leftover = unique
      .filter((key) => !pinSet.has(normalizeCwd(key)) && !groupedKeys.has(key))
      .sort(byName);
    for (const key of leftover) emitProject(key, "projects");
    if (inboxRows.length) {
      sections.push({
        id: "inbox",
        label: tr("sidebar.inbox"),
        kind: "inbox",
        band: "inbox",
        rows: sortSessions(inboxRows, opts.prefs.ordering, opts.titles, opts.preview).map((session) => toRow(opts, session, 0)),
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
      const flat = flattenForks(sortSessions(rows, opts.prefs.ordering, opts.titles, opts.preview));
      sections.push({
        id: TIME_META[key].id,
        label: tr(TIME_META[key].label),
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
    const flat = flattenForks(sortSessions(rows, opts.prefs.ordering, opts.titles, opts.preview));
    sections.push({
      id: STATUS_META[key].id,
      label: tr(STATUS_META[key].label),
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
