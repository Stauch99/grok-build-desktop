import type { PermissionContext } from "./permission-queue";
import type { PlanEntry } from "./chat";
import type { ReviewData } from "./review-rail";
import type { SessionStatus } from "./session-status";
import type { Mode } from "./mode";
import { shouldBlockIdleComposer } from "./agent-warmup";
import { displayTitle } from "./projects";
import { heroLayout } from "./shell-ia";

export function planIsComplete(mode: Mode, plan: readonly Pick<PlanEntry, "status">[]): boolean {
  return mode === "plan" && plan.length > 0 && plan.every((e) => e.status === "completed");
}

export type DashboardSession = {
  id: string;
  title: string;
  status: "needs-input" | "running" | "idle";
};

export function dashboardStatus(st: SessionStatus): DashboardSession["status"] {
  return st === "needs-you" ? "needs-input" : st === "working" ? "running" : "idle";
}

export function mapDashboardSessions(
  sessions: readonly { id: string; title: string }[],
  titles: Record<string, string>,
  statusFor: (id: string) => SessionStatus,
): DashboardSession[] {
  return sessions.map((s) => ({
    id: s.id,
    title: displayTitle(s, titles),
    status: dashboardStatus(statusFor(s.id)),
  }));
}

export function permissionContextFrom(opts: {
  sessionId: string | null;
  runningSessionId: string | null;
  splitId: string | null;
  busy: boolean;
  splitBusy: boolean;
  extraPanes?: { id: string; sessionId: string | null; busy: boolean }[];
}): PermissionContext {
  return {
    mainSessionId: opts.sessionId,
    runningMainSessionId: opts.runningSessionId,
    splitSessionId: opts.splitId,
    mainBusy: opts.busy,
    splitBusy: opts.splitBusy,
    extraPanes: opts.extraPanes,
  };
}

export function deriveHero(opts: {
  hasMessages: boolean;
  hasCwd: boolean;
  connecting: boolean;
  ready: boolean;
}): { hero: boolean; blocked: boolean } {
  const layout = heroLayout({ hasMessages: opts.hasMessages, hasCwd: opts.hasCwd });
  return {
    ...layout,
    blocked: layout.blocked || shouldBlockIdleComposer(opts.connecting, opts.ready, opts.hasMessages),
  };
}

export function ruleFilePath(rules: readonly { name: string; path: string }[], name: string): string | undefined {
  return rules.find((r) => r.name === name)?.path;
}

export function reviewDataFrom(opts: {
  planCount: number;
  fileCount: number;
  changeCount: number;
  hasPlanFile: boolean;
  ruleCount: number;
  hasDetails: boolean;
  hasPreview: boolean;
  bashCount: number;
}): ReviewData {
  return {
    planCount: opts.planCount,
    fileCount: opts.fileCount,
    changeCount: opts.changeCount,
    contextCount: (opts.hasPlanFile ? 1 : 0) + opts.ruleCount,
    hasDetails: opts.hasDetails,
    hasPreview: opts.hasPreview,
    bashCount: opts.bashCount,
  };
}

export function trustRequired(inspect: { projectTrusted?: boolean } | null, cwd: string): boolean {
  return !!(inspect && cwd && inspect.projectTrusted === false);
}

/** Running chrome for this pane, including the gap after send before session ids catch up. */
export function mainPaneIsBusy(opts: {
  busy: boolean;
  sessionId: string | null;
  runningSessionId: string | null;
}): boolean {
  if (!opts.busy) return false;
  if (opts.runningSessionId && opts.sessionId && opts.sessionId !== opts.runningSessionId) return false;
  return true;
}
