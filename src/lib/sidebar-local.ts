/**
 * Sidebar prefs that live in localStorage rather than webui.json — the
 * status quick-filter and row density are per-window chrome, not state the
 * CLI cares about. `storageGet`/`storageSet` are null-safe so the same code
 * runs under SSR tests and private-mode storage failures.
 */
import type { SessionStatus } from "./session-status";
import type { SidebarSection } from "./sidebar-list";

export type SidebarQuickFilter = "all" | "needs-you" | "working";

export const SIDEBAR_QUICK_FILTER_KEY = "grok.sidebar.quickFilter";

export const QUICK_FILTER_ORDER: readonly SidebarQuickFilter[] = ["all", "needs-you", "working"];

export function loadSidebarQuickFilter(raw: unknown): SidebarQuickFilter {
  return QUICK_FILTER_ORDER.includes(raw as SidebarQuickFilter)
    ? (raw as SidebarQuickFilter)
    : "all";
}

/** "Needs you" pulls error rows in too — both wait on the human. */
export function matchesQuickFilter(status: SessionStatus, filter: SidebarQuickFilter): boolean {
  if (filter === "needs-you") return status === "needs-you" || status === "error";
  if (filter === "working") return status === "working";
  return true;
}

/** Drop sections that filter to zero rows so a filtered list stays tight. */
export function filterSidebarSections(
  sections: readonly SidebarSection[],
  filter: SidebarQuickFilter,
  statusFor: (id: string) => SessionStatus,
): SidebarSection[] {
  if (filter === "all") return [...sections];
  const out: SidebarSection[] = [];
  for (const section of sections) {
    const rows = section.rows.filter((row) =>
      matchesQuickFilter(statusFor(row.session.id), filter),
    );
    if (rows.length) out.push({ ...section, rows });
  }
  return out;
}

export type SidebarDensity = "comfortable" | "compact";

export const SIDEBAR_DENSITY_KEY = "grok.sidebar.density";

export function loadSidebarDensity(raw: unknown): SidebarDensity {
  return raw === "compact" ? "compact" : "comfortable";
}

export function nextSidebarDensity(density: SidebarDensity): SidebarDensity {
  return density === "compact" ? "comfortable" : "compact";
}

/** Browser localStorage, falling back to window.localStorage under jsdom tests. */
function store(): Storage | null {
  try {
    if (typeof localStorage !== "undefined") return localStorage;
    if (typeof window !== "undefined" && window.localStorage) return window.localStorage;
  } catch {
    return null;
  }
  return null;
}

export function storageGet(key: string): string | null {
  try {
    return store()?.getItem(key) ?? null;
  } catch {
    return null;
  }
}

export function storageGetJson(key: string): unknown {
  const raw = storageGet(key);
  if (!raw) return null;
  try {
    return JSON.parse(raw);
  } catch {
    return null;
  }
}

export function storageSet(key: string, value: string): void {
  try {
    store()?.setItem(key, value);
  } catch {
    /* storage can throw in private mode — prefs are best-effort */
  }
}
