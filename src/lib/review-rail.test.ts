import { describe, expect, it } from "vitest";
import { REVIEW_TABS, deriveReviewTabs, initialReviewState, persistReviewOpen, reconcileReviewTab, reviewLandingTab, reviewPersistsOpen, reviewReducer, reviewTabForAction, reviewTabFromLegacy } from "./review-rail";

describe("review rail model", () => {
  it("defines review subtabs plus a peer preview pane", () => {
    expect(REVIEW_TABS.map((tab) => tab.id)).toEqual([
      "progress", "files", "changes", "terminal", "preview",
    ]);
  });

  it("opens the layout toggle onto the last content tab, not home", () => {
    const fromProgress = reviewReducer({ ...initialReviewState, tab: "progress" }, { type: "toggle" });
    expect(fromProgress.open).toBe(true);
    expect(fromProgress.tab).toBe("progress");
    const fromHome = reviewReducer({ ...initialReviewState, open: false, tab: "home" }, { type: "toggle", defaultTab: "tasks" });
    expect(fromHome.tab).toBe("progress");
    const fromChanges = reviewReducer({ ...initialReviewState, open: false, tab: "changes" }, { type: "toggle" });
    expect(fromChanges.tab).toBe("changes");
  });

  it("keeps files, preview, and terminal available even when empty", () => {
    const tabs = deriveReviewTabs({
      planCount: 0, fileCount: 0, changeCount: 0, contextCount: 0,
      hasDetails: false, hasPreview: false, bashCount: 2,
    });
    expect(tabs.find((t) => t.id === "home")).toBeUndefined();
    expect(tabs.find((t) => t.id === "context")).toBeUndefined();
    expect(tabs.find((t) => t.id === "details")).toBeUndefined();
    expect(tabs.find((t) => t.id === "files")?.available).toBe(true);
    expect(tabs.find((t) => t.id === "preview")?.available).toBe(true);
    expect(tabs.find((t) => t.id === "terminal")).toEqual({ id: "terminal", label: "终端", available: true, count: 2 });
  });

  it("maps a leftover home tab to the settings default", () => {
    expect(reviewLandingTab("home", "changes")).toBe("changes");
    expect(reviewLandingTab("home", "tasks")).toBe("progress");
    expect(reviewLandingTab("preview")).toBe("preview");
  });

  it.each([
    ["plan", "progress"], ["changed-file", "changes"], ["tool-detail", "changes"],
    ["preview-path", "preview"], ["turn-file", "files"], ["context", "progress"],
  ] as const)("routes %s openings to %s", (action, tab) => {
    expect(reviewTabForAction(action)).toBe(tab);
  });

  it("derives availability and counts from current review data", () => {
    const tabs = deriveReviewTabs({ planCount: 3, fileCount: 2, changeCount: 4, contextCount: 5, hasDetails: false, hasPreview: true, bashCount: 0 });
    expect(tabs.map(({ id, available, count }) => ({ id, available, count }))).toEqual([
      { id: "progress", available: true, count: 3 }, { id: "files", available: true, count: 2 },
      { id: "changes", available: true, count: 4 },
      { id: "terminal", available: true, count: 0 },
      { id: "preview", available: true, count: 1 },
    ]);
  });

  it.each([["tasks", "progress"], ["changes", "changes"], ["context", "progress"], [undefined, "progress"]] as const)("maps legacy default %s to %s", (legacy, tab) => {
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
    expect(reconcileReviewTab("changes", tabs, "context")).toBe("changes");
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
});
