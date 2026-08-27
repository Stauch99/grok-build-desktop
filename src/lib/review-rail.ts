export type ReviewTab = "home" | "progress" | "files" | "changes" | "context" | "details" | "preview" | "terminal";
export type ReviewOpenAction = "plan" | "turn-file" | "changed-file" | "context" | "tool-detail" | "preview-path";
export type LegacyReviewTab = "tasks" | "changes" | "context";

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

const ACTION_TAB: Record<ReviewOpenAction, ReviewTab> = {
  plan: "progress", "turn-file": "files", "changed-file": "changes",
  context: "context", "tool-detail": "details", "preview-path": "preview",
};

export function reviewTabForAction(action: ReviewOpenAction): ReviewTab { return ACTION_TAB[action]; }

export function persistReviewOpen(open: boolean): { filePanelOpen: boolean } {
  return { filePanelOpen: open };
}

export function reviewPersistsOpen(action: ReviewAction["type"]): boolean {
  return action === "open" || action === "preview-start" || action === "details";
}

export function reviewTabFromLegacy(tab?: LegacyReviewTab): ReviewTab {
  if (tab === "changes" || tab === "context") return tab;
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

export function reconcileReviewTab(active: ReviewTab, tabs: readonly ReviewTabState[], preferred?: LegacyReviewTab): ReviewTab {
  if (tabs.some((tab) => tab.id === active && tab.available)) return active;
  const fallback = reviewTabFromLegacy(preferred);
  return tabs.find((tab) => tab.id === fallback && tab.available)?.id
    ?? tabs.find((tab) => tab.available)?.id
    ?? active;
}


import type { ChatItem } from "./chat";

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
  tab: "home",
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
  | { type: "owner-change"; requestId: number; disabled: boolean };

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
        : { ...state, open: true, tab: RESTORE_ON_TOGGLE.has(state.tab) ? state.tab : "home" };
    case "tab": return { ...state, tab: action.tab };
    case "hydrate-legacy": {
      const open = action.open ?? state.open;
      const tab = action.defaultTab ? reviewTabFromLegacy(action.defaultTab) : state.tab;
      return {
        ...state,
        open,
        tab: open && !RESTORE_ON_TOGGLE.has(tab) ? "home" : tab,
      };
    }
    case "details": return { ...state, open: true, tab: "details", detailsTool: action.tool };
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
      detailsTool: null,
      preview: { path: null, text: null, truncated: false, error: null, requestId: action.requestId },
    };
  }
}
