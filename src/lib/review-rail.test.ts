import { describe, expect, it } from "vitest";
import {
  REVIEW_PEERS,
  REVIEW_SUBTABS,
  REVIEW_TABS,
  deriveReviewTabs,
  initialReviewState,
  persistReviewOpen,
  recalledReviewTab,
  reconcileReviewTab,
  rememberReviewTab,
  reviewLandingTab,
  reviewPeerPane,
  reviewPersistsOpen,
  reviewReducer,
  reviewPaneLabel,
  reviewTabForAction,
  reviewTabFromLegacy,
  reviewTabLabel,
} from "./review-rail";

describe("review rail model", () => {
  it("defines review subtabs plus git, preview, and explorer peer panes", () => {
    expect(REVIEW_TABS.map((tab) => tab.id)).toEqual([
      "progress", "files", "terminal", "git", "preview", "explorer",
    ]);
    expect([...REVIEW_SUBTABS]).toEqual(["progress", "files", "terminal"]);
    expect(REVIEW_PEERS.map((pane) => pane.id)).toEqual(["review", "git", "preview", "explorer"]);
    expect(REVIEW_PEERS[0]?.label).toBe("Dashboard");
    expect(REVIEW_PEERS.find((pane) => pane.id === "explorer")?.label).toBe("文件管理");
    expect(reviewPaneLabel("zh", "explorer")).toBe("文件管理");
    expect(reviewPaneLabel("en", "explorer")).toBe("Files");
    expect(reviewPaneLabel("en", "review")).toBe("Dashboard");
    expect(reviewTabLabel("en", "progress")).toBe("Progress");
    expect(reviewTabLabel("en", "terminal")).toBe("Terminal");
  });

  it("opens the layout toggle onto the last content tab, not home", () => {
    const fromProgress = reviewReducer({ ...initialReviewState, tab: "progress" }, { type: "toggle" });
    expect(fromProgress.open).toBe(true);
    expect(fromProgress.tab).toBe("progress");
    const fromHome = reviewReducer({ ...initialReviewState, open: false, tab: "home" }, { type: "toggle", defaultTab: "tasks" });
    expect(fromHome.tab).toBe("progress");
    const fromGit = reviewReducer({ ...initialReviewState, open: false, tab: "git" }, { type: "toggle" });
    expect(fromGit.tab).toBe("git");
  });

  it("keeps files, git, preview, and terminal available even when empty", () => {
    const tabs = deriveReviewTabs({
      planCount: 0, fileCount: 0, changeCount: 0, contextCount: 0,
      hasDetails: false, hasPreview: false, bashCount: 2,
    });
    expect(tabs.find((t) => t.id === "home")).toBeUndefined();
    expect(tabs.find((t) => t.id === "context")).toBeUndefined();
    expect(tabs.find((t) => t.id === "details")).toBeUndefined();
    expect(tabs.find((t) => t.id === "changes")).toBeUndefined();
    expect(tabs.find((t) => t.id === "files")?.available).toBe(true);
    expect(tabs.find((t) => t.id === "git")?.available).toBe(true);
    expect(tabs.find((t) => t.id === "preview")?.available).toBe(true);
    expect(tabs.find((t) => t.id === "explorer")?.available).toBe(true);
    expect(tabs.find((t) => t.id === "terminal")).toEqual({ id: "terminal", label: "终端", available: true, count: 2 });
  });

  it("maps a leftover home tab to the settings default", () => {
    expect(reviewLandingTab("home", "changes")).toBe("git");
    expect(reviewLandingTab("home", "tasks")).toBe("progress");
    expect(reviewLandingTab("preview")).toBe("preview");
    expect(reviewLandingTab("git")).toBe("git");
    expect(reviewLandingTab("explorer")).toBe("explorer");
  });

  it.each([
    ["plan", "progress"], ["changed-file", "git"], ["tool-detail", "git"],
    ["preview-path", "preview"], ["turn-file", "files"], ["context", "progress"],
  ] as const)("routes %s openings to %s", (action, tab) => {
    expect(reviewTabForAction(action)).toBe(tab);
  });

  it("classifies git, preview, and explorer as peer panes, not review subtabs", () => {
    expect(reviewPeerPane("progress")).toBe("review");
    expect(reviewPeerPane("files")).toBe("review");
    expect(reviewPeerPane("terminal")).toBe("review");
    expect(reviewPeerPane("git")).toBe("git");
    expect(reviewPeerPane("changes")).toBe("git");
    expect(reviewPeerPane("preview")).toBe("preview");
    expect(reviewPeerPane("explorer")).toBe("explorer");
  });

  it("derives availability and counts from current review data", () => {
    const tabs = deriveReviewTabs({ planCount: 3, fileCount: 2, changeCount: 4, contextCount: 5, hasDetails: false, hasPreview: true, bashCount: 0 });
    expect(tabs.map(({ id, available, count }) => ({ id, available, count }))).toEqual([
      { id: "progress", available: true, count: 3 }, { id: "files", available: true, count: 2 },
      { id: "terminal", available: true, count: 0 },
      { id: "git", available: true, count: 4 },
      { id: "preview", available: true, count: 1 },
      { id: "explorer", available: true, count: 0 },
    ]);
  });

  it.each([["tasks", "progress"], ["changes", "git"], ["context", "progress"], [undefined, "progress"]] as const)("maps legacy default %s to %s", (legacy, tab) => {
    expect(reviewTabFromLegacy(legacy)).toBe(tab);
  });

  it("keeps the newest preview when an older request finishes later", () => {
    const loadingA = reviewReducer(initialReviewState, { type: "preview-start", path: "a.md", requestId: 1 });
    const loadingB = reviewReducer(loadingA, { type: "preview-start", path: "b.md", requestId: 2 });
    const staleA = reviewReducer(loadingB, { type: "preview-success", requestId: 1, path: "a.md", text: "old", truncated: false });
    const loadedB = reviewReducer(staleA, { type: "preview-success", requestId: 2, path: "b.md", text: "new", truncated: true });

    expect(staleA).toBe(loadingB);
    expect(loadedB.preview).toEqual({ path: "b.md", text: "new", truncated: true, error: null, requestId: 2 });
  });

  it("ignores a stale preview error", () => {
    const loadingA = reviewReducer(initialReviewState, { type: "preview-start", path: "a.md", requestId: 1 });
    const loadingB = reviewReducer(loadingA, { type: "preview-start", path: "b.md", requestId: 2 });
    expect(reviewReducer(loadingB, { type: "preview-error", requestId: 1, error: "late failure" })).toBe(loadingB);
  });

  it("ignores text saved for an older preview path", () => {
    const a = reviewReducer(initialReviewState, { type: "preview-start", path: "/work/a.md", requestId: 1 });
    const b = reviewReducer(a, { type: "preview-start", path: "/work/b.md", requestId: 2 });
    expect(reviewReducer(b, { type: "preview-text", path: "/work/a.md", requestId: 1, text: "saved a" })).toBe(b);
    expect(reviewReducer(b, { type: "preview-text", path: "/work/b.md", requestId: 2, text: "saved b" }).preview.text).toBe("saved b");
  });

  it("invalidates a loading preview before handing a newer file to the OS", () => {
    const loading = reviewReducer(initialReviewState, { type: "preview-start", path: "a.md", requestId: 1 });
    const handedOff = reviewReducer(loading, { type: "preview-invalidate", requestId: 2 });
    expect(reviewReducer(handedOff, { type: "preview-success", requestId: 1, path: "a.md", text: "old", truncated: false })).toBe(handedOff);
  });

  it("routes a selected turn file directly to preview", () => {
    const state = reviewReducer(initialReviewState, { type: "open", action: "turn-file", path: "src/App.tsx", requestId: 7 });
    expect(state.open).toBe(true);
    expect(state.tab).toBe("preview");
    expect(state.preview.path).toBe("src/App.tsx");
  });

  it("reconciles unavailable tabs deterministically", () => {
    const tabs = deriveReviewTabs({ planCount: 0, fileCount: 0, changeCount: 0, contextCount: 0, hasDetails: false, hasPreview: false, bashCount: 0 });
    expect(reconcileReviewTab("home", tabs, "context")).toBe("progress");
    expect(reconcileReviewTab("details", tabs, "context")).toBe("progress");
    expect(reconcileReviewTab("changes", tabs, "context")).toBe("git");
    expect(reconcileReviewTab("git", tabs, "context")).toBe("git");
    expect(reconcileReviewTab("preview", [{ id: "files", label: "文件", available: true, count: 1 }], "tasks")).toBe("files");
  });

  it("persists the rail open for tab, preview, and details openings, not reveal or close", () => {
    expect(persistReviewOpen(true)).toEqual({ filePanelOpen: true });
    expect(persistReviewOpen(false)).toEqual({ filePanelOpen: false });
    expect(reviewPersistsOpen("open")).toBe(true);
    expect(reviewPersistsOpen("preview-start")).toBe(true);
    expect(reviewPersistsOpen("details")).toBe(true);
    expect(reviewPersistsOpen("preview-invalidate")).toBe(false);
    expect(reviewPersistsOpen("close")).toBe(false);
  });

  it("clears owned state and invalidates pending work on owner change", () => {
    const loading = reviewReducer(initialReviewState, { type: "preview-start", path: "a.md", requestId: 3 });
    const changed = reviewReducer(loading, { type: "owner-change", requestId: 4, disabled: true });
    expect(changed.open).toBe(false);
    expect(changed.detailsTool).toBeNull();
    expect(changed.preview).toEqual({ path: null, text: null, truncated: false, error: null, requestId: 4 });
    expect(reviewReducer(changed, { type: "preview-success", requestId: 3, path: "a.md", text: "stale", truncated: false })).toBe(changed);
  });

  it("keeps the rail open and restores the remembered tab when focus moves", () => {
    const open = reviewReducer(
      { ...initialReviewState, open: true, tab: "git" },
      { type: "owner-change", requestId: 5, disabled: false, tab: "preview" },
    );
    expect(open.open).toBe(true);
    expect(open.tab).toBe("preview");
    expect(open.preview.requestId).toBe(5);
  });

  it("remembers a session tab and recalls it later", () => {
    const a = rememberReviewTab({}, "s1|/work", "preview");
    const b = rememberReviewTab(a, "s2|/other", "files");
    expect(recalledReviewTab(b, "s1|/work", "progress")).toBe("preview");
    expect(recalledReviewTab(b, "s2|/other", "progress")).toBe("files");
    expect(recalledReviewTab(b, "s3|/new", "git")).toBe("git");
    expect(rememberReviewTab(b, "s1|/work", "preview")).toBe(b);
    expect(rememberReviewTab(b, "", "git")).toBe(b);
  });
});
