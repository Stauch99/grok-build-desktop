import type { ChatItem } from "./chat";
import { t, type Locale } from "./i18n";

export type ReviewTab = "home" | "progress" | "files" | "changes" | "git" | "context" | "details" | "preview" | "terminal" | "explorer";
export type ReviewOpenAction = "plan" | "turn-file" | "changed-file" | "context" | "tool-detail" | "preview-path";
export type LegacyReviewTab = "tasks" | "changes" | "context";
export type ReviewPeerPane = "review" | "git" | "preview" | "explorer";

export const REVIEW_TABS: ReadonlyArray<{ id: ReviewTab; label: string }> = [
  { id: "progress", label: "进度" },
  { id: "files", label: "文件" },
  { id: "terminal", label: "终端" },
  { id: "git", label: "Git" },
  { id: "preview", label: "预览" },
  { id: "explorer", label: "文件管理" },
];

export const REVIEW_SUBTABS: ReadonlySet<ReviewTab> = new Set(["progress", "files", "terminal"]);

export const REVIEW_PEERS: ReadonlyArray<{ id: ReviewPeerPane; label: string }> = [
  { id: "review", label: "Dashboard" },
  { id: "git", label: "Git" },
  { id: "preview", label: "预览" },
  { id: "explorer", label: "文件管理" },
];

export const RESTORE_ON_TOGGLE: ReadonlySet<ReviewTab> = new Set(["git", "files", "preview", "terminal", "progress", "explorer"]);

/** Persisted `changes` is the Git pane; keep the old id only as a legacy alias. */
export function normalizeReviewTab(tab: ReviewTab): ReviewTab {
  return tab === "changes" ? "git" : tab;
}

export function reviewPeerPane(tab: ReviewTab): ReviewPeerPane {
  const id = normalizeReviewTab(tab);
  if (id === "git") return "git";
  if (id === "preview") return "preview";
  if (id === "explorer") return "explorer";
  return "review";
}

/** Layout toggle lands on the last content tab, never the 2×2 home grid. */
export function reviewLandingTab(tab: ReviewTab, defaultTab?: LegacyReviewTab): ReviewTab {
  const normalized = normalizeReviewTab(tab);
  if (normalized !== "home" && RESTORE_ON_TOGGLE.has(normalized)) return normalized;
  return reviewTabFromLegacy(defaultTab);
}

const ACTION_TAB: Record<ReviewOpenAction, ReviewTab> = {
  plan: "progress", "turn-file": "files", "changed-file": "git",
  context: "progress", "tool-detail": "git", "preview-path": "preview",
};

export function reviewTabForAction(action: ReviewOpenAction): ReviewTab { return ACTION_TAB[action]; }

export function reviewTabLabel(locale: Locale, id: ReviewTab): string {
  if (id === "home" || id === "details" || id === "context") return "Dashboard";
  const key = id === "changes" ? "git" : id;
  return t(locale, `rail.${key}`);
}

export function reviewPaneLabel(locale: Locale, id: ReviewPeerPane): string {
  return t(locale, `rail.${id}`);
}

export function persistReviewOpen(open: boolean): { filePanelOpen: boolean } {
  return { filePanelOpen: open };
}

export type ReviewTabMemory = Record<string, ReviewTab>;

/** Store the last rail tab a session used. Empty keys are ignored. */
export function rememberReviewTab(memory: ReviewTabMemory, ownerKey: string, tab: ReviewTab): ReviewTabMemory {
  if (!ownerKey) return memory;
  const next = normalizeReviewTab(tab);
  if (memory[ownerKey] === next) return memory;
  return { ...memory, [ownerKey]: next };
}

/** Recall a session's last rail tab, or the fallback if it has never been opened. */
export function recalledReviewTab(memory: ReviewTabMemory, ownerKey: string, fallback: ReviewTab): ReviewTab {
  const hit = ownerKey ? memory[ownerKey] : undefined;
  return normalizeReviewTab(hit ?? fallback);
}

export function reviewPersistsOpen(action: ReviewAction["type"]): boolean {
  return action === "open" || action === "preview-start" || action === "details";
}

export function reviewTabFromLegacy(tab?: LegacyReviewTab): ReviewTab {
  if (tab === "changes") return "git";
  return "progress";
}

export type ReviewData = { planCount: number; fileCount: number; changeCount: number; contextCount: number; hasDetails: boolean; hasPreview: boolean; bashCount: number };
export type ReviewTabState = { id: ReviewTab; label: string; available: boolean; count: number };
export function deriveReviewTabs(data: ReviewData): ReviewTabState[] {
  const counts: Record<ReviewTab, number> = {
    home: 0,
    progress: data.planCount,
    files: data.fileCount,
    changes: data.changeCount,
    git: data.changeCount,
    context: data.contextCount,
    details: data.hasDetails ? 1 : 0,
    preview: data.hasPreview ? 1 : 0,
    terminal: data.bashCount,
    explorer: 0,
  };
  return REVIEW_TABS.map((tab) => ({
    ...tab,
    count: counts[tab.id],
    available:
      tab.id === "terminal" ||
      tab.id === "files" ||
      tab.id === "preview" ||
      tab.id === "git" ||
      tab.id === "explorer" ||
      tab.id === "progress" ||
      counts[tab.id] > 0,
  }));
}

export function reconcileReviewTab(active: ReviewTab, tabs: readonly ReviewTabState[], preferred?: LegacyReviewTab): ReviewTab {
  const normalized = normalizeReviewTab(active);
  if (tabs.some((tab) => tab.id === normalized && tab.available)) return normalized;
  const fallback = reviewTabFromLegacy(preferred);
  return tabs.find((tab) => tab.id === fallback && tab.available)?.id
    ?? tabs.find((tab) => tab.available)?.id
    ?? normalized;
}


export type ReviewDetailsTool = Extract<ChatItem, { kind: "tool" }>;
export type ReviewPreviewState = {
  path: string | null;
  text: string | null;
  truncated: boolean;
  error: string | null;
  requestId: number;
};
export type ReviewState = {
  open: boolean;
  tab: ReviewTab;
  detailsTool: ReviewDetailsTool | null;
  preview: ReviewPreviewState;
};
export const initialReviewState: ReviewState = {
  open: false,
  tab: "git",
  detailsTool: null,
  preview: { path: null, text: null, truncated: false, error: null, requestId: 0 },
};
export type ReviewAction =
  | { type: "open"; action: ReviewOpenAction; path?: string; requestId?: number }
  | { type: "close" }
  | { type: "toggle"; defaultTab?: LegacyReviewTab }
  | { type: "tab"; tab: ReviewTab }
  | { type: "hydrate-legacy"; open?: boolean; defaultTab?: LegacyReviewTab }
  | { type: "details"; tool: ReviewDetailsTool }
  | { type: "preview-start"; path: string; requestId: number }
  | { type: "preview-invalidate"; requestId: number }
  | { type: "preview-success"; path: string; text: string; truncated: boolean; requestId: number }
  | { type: "preview-error"; error: string; requestId: number }
  | { type: "preview-text"; path: string; requestId: number; text: string }
  | { type: "owner-change"; requestId: number; disabled: boolean; tab?: ReviewTab };

export function reviewReducer(state: ReviewState, action: ReviewAction): ReviewState {
  switch (action.type) {
    case "open": {
      if (action.path) {
        return {
          ...state,
          open: true,
          tab: "preview",
          preview: { path: action.path, text: null, truncated: false, error: null, requestId: action.requestId ?? state.preview.requestId },
        };
      }
      return { ...state, open: true, tab: reviewTabForAction(action.action) };
    }
    case "close": return { ...state, open: false };
    case "toggle":
      return state.open
        ? { ...state, open: false }
        : { ...state, open: true, tab: reviewLandingTab(state.tab, action.defaultTab) };
    case "tab": return { ...state, tab: normalizeReviewTab(action.tab) };
    case "hydrate-legacy": {
      const open = action.open ?? state.open;
      const tab = action.defaultTab ? reviewTabFromLegacy(action.defaultTab) : state.tab;
      return {
        ...state,
        open,
        tab: reviewLandingTab(tab, action.defaultTab),
      };
    }
    case "details": return { ...state, open: true, detailsTool: action.tool };
    case "preview-start": return {
      ...state,
      open: true,
      tab: "preview",
      preview: { path: action.path, text: null, truncated: false, error: null, requestId: action.requestId },
    };
    case "preview-invalidate": return { ...state, preview: { ...state.preview, requestId: action.requestId } };
    case "preview-success":
      if (action.requestId !== state.preview.requestId) return state;
      return { ...state, preview: { path: action.path, text: action.text, truncated: action.truncated, error: null, requestId: action.requestId } };
    case "preview-error":
      if (action.requestId !== state.preview.requestId) return state;
      return { ...state, preview: { ...state.preview, error: action.error } };
    case "preview-text":
      if (action.requestId !== state.preview.requestId || action.path !== state.preview.path) return state;
      return { ...state, preview: { ...state.preview, text: action.text } };
    case "owner-change": return {
      ...state,
      open: action.disabled ? false : state.open,
      tab: action.tab ?? state.tab,
      detailsTool: null,
      preview: { path: null, text: null, truncated: false, error: null, requestId: action.requestId },
    };
  }
}
