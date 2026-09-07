import { useCallback, useEffect, useMemo, useReducer, useRef, useState } from "react";
import type { TextFilePreview } from "../api";
import { toggleExplorerDir } from "../lib/explorer";
import {
  initialReviewState,
  recalledReviewPane,
  recalledReviewTab,
  rememberReviewPane,
  rememberReviewTab,
  reviewPaneSnapshotFrom,
  reviewReducer,
  type LegacyReviewTab,
  type ReviewDetailsTool,
  type ReviewOpenAction,
  type ReviewPaneMemory,
  type ReviewTab,
  type ReviewTabMemory,
} from "../lib/review-rail";
import { t, type Locale } from "../lib/i18n";
import {
  activeTabAfterClose,
  previewErrorCopy,
  previewKind,
  putPreviewCache,
  removePreviewTab,
  upsertPreviewTab,
  type PreviewCacheEntry,
  type PreviewTab,
} from "../lib/preview";

export type ReviewControllerDependencies = {
  cwd: string;
  ownerKey: string;
  disabled: boolean;
  locale?: Locale;
  readTextFile: (path: string, allowRoot?: string | null) => Promise<TextFilePreview>;
  openReviewPath: (path: string, allowRoot: string) => Promise<void>;
  onError: (message: string) => void;
  isTextPreviewable: (path: string) => boolean;
  onOpened?: () => void;
};

export type ReviewController = {
  open: boolean;
  tab: ReviewTab;
  detailsTool: ReviewDetailsTool | null;
  preview: typeof initialReviewState.preview;
  openReview: (action: ReviewOpenAction) => void;
  openTurnFile: (path: string) => Promise<void>;
  openPreview: (path: string) => Promise<void>;
  revealPath: (path: string) => Promise<void>;
  inspectTool: (tool: ReviewDetailsTool) => void;
  close: () => void;
  toggle: (defaultTab?: LegacyReviewTab) => void;
  setTab: (tab: ReviewTab) => void;
  hydrateLegacy: (value: { open?: boolean; defaultTab?: LegacyReviewTab }) => void;
  setPreviewText: (path: string, requestId: number, text: string) => void;
  previewTabs: PreviewTab[];
  selectPreviewTab: (path: string) => void;
  closePreviewTab: (path: string) => void;
  expandedDirs: string[];
  toggleExplorerDir: (path: string) => void;
};

export function replaceAbortController(prev: AbortController | null): AbortController {
  prev?.abort();
  return new AbortController();
}

export function reviewOwnerKey(sessionId: string | null, cwd: string): string {
  return (sessionId || "") + "|" + cwd;
}

/** True when a blank new-chat owner becomes a real session id in the same workspace. */
export function reviewOwnerAdopted(prevKey: string, nextKey: string): boolean {
  const prevBar = prevKey.indexOf("|");
  const nextBar = nextKey.indexOf("|");
  if (prevBar < 0 || nextBar < 0) return false;
  const prevId = prevKey.slice(0, prevBar);
  const nextId = nextKey.slice(0, nextBar);
  return !prevId && !!nextId && prevKey.slice(prevBar + 1) === nextKey.slice(nextBar + 1);
}

export function shouldSkipRememberOnOwnerChange(currentTab: ReviewTab, recalledTab: ReviewTab): boolean {
  return currentTab !== recalledTab;
}

export function resolveReviewPath(path: string, cwd: string): string {
  const absolute = path.startsWith("/") || path.startsWith("\\") || /^[A-Za-z]:[\\/]/.test(path);
  if (absolute || !cwd) return path;
  const separator = cwd.includes("\\") && !cwd.includes("/") ? "\\" : "/";
  return cwd.replace(/[\\/]+$/, "") + separator + path.replace(/^[.][\\/]/, "");
}

export function validateReviewFallbackTarget(path: string, cwd: string, locale: Locale = "zh"): string | null {
  const normalized = path.replace(/\\/g, "/");
  const root = cwd.replace(/\\/g, "/").replace(/\/+$/, "");
  if (!root) return t(locale, "review.noWorkspace");
  if (/^[a-z][a-z0-9+.-]*:/i.test(normalized)) return t(locale, "review.noUrl");
  if (!(normalized === root || normalized.startsWith(root + "/"))) return t(locale, "review.outside");
  if (/(^|\/)[^/]+\.app(?:\/|$)/i.test(normalized) || /\.(?:exe|com|bat|cmd|appimage|desktop)$/i.test(normalized)) return t(locale, "review.noExec");
  return null;
}

export function useReviewController(deps: ReviewControllerDependencies): ReviewController {
  const [state, dispatch] = useReducer(reviewReducer, initialReviewState);
  const [previewTabs, setPreviewTabs] = useState<PreviewTab[]>([]);
  const [expandedDirs, setExpandedDirs] = useState<string[]>([]);
  const requestId = useRef(0);
  const ownerKey = useRef(deps.ownerKey);
  const abortRef = useRef<AbortController | null>(null);
  const previewCache = useRef(new Map<string, PreviewCacheEntry>());
  const tabMemory = useRef<ReviewTabMemory>({});
  const paneMemory = useRef<ReviewPaneMemory>({});
  const lastTab = useRef<ReviewTab>(initialReviewState.tab);
  const rememberedOwner = useRef(deps.ownerKey);
  const skipRemember = useRef(false);
  const pendingRestore = useRef<string | null>(null);
  const previewTabsRef = useRef(previewTabs);
  const previewPathRef = useRef(state.preview.path);
  const expandedDirsRef = useRef(expandedDirs);
  const openPreviewRef = useRef<(path: string, opts?: { silent?: boolean }) => Promise<void>>(async () => {});
  previewTabsRef.current = previewTabs;
  previewPathRef.current = state.preview.path;
  expandedDirsRef.current = expandedDirs;
  ownerKey.current = deps.ownerKey;

  useEffect(() => {
    abortRef.current = replaceAbortController(abortRef.current);
    const ac = abortRef.current;
    requestId.current += 1;
    const prevOwner = rememberedOwner.current;
    const prevTab = lastTab.current;
    const ownerChanged = prevOwner !== deps.ownerKey;
    if (ownerChanged) {
      tabMemory.current = rememberReviewTab(tabMemory.current, prevOwner, prevTab);
      paneMemory.current = rememberReviewPane(
        paneMemory.current,
        prevOwner,
        reviewPaneSnapshotFrom(previewTabsRef.current, previewPathRef.current, expandedDirsRef.current),
      );
    }
    const recalled = recalledReviewTab(tabMemory.current, deps.ownerKey, prevTab);
    skipRemember.current = shouldSkipRememberOnOwnerChange(prevTab, recalled);
    lastTab.current = recalled;
    rememberedOwner.current = deps.ownerKey;
    dispatch({ type: "owner-change", requestId: requestId.current, disabled: deps.disabled, tab: recalled });
    if (ownerChanged) {
      const pane = recalledReviewPane(paneMemory.current, deps.ownerKey);
      const live = reviewPaneSnapshotFrom(previewTabsRef.current, previewPathRef.current, expandedDirsRef.current);
      const keepLive = reviewOwnerAdopted(prevOwner, deps.ownerKey)
        && pane.previewPaths.length === 0
        && pane.expandedDirs.length === 0
        && !pane.previewPath;
      if (keepLive) {
        paneMemory.current = rememberReviewPane(paneMemory.current, deps.ownerKey, live);
        pendingRestore.current = live.previewPath || live.previewPaths.at(-1) || null;
      } else {
        setPreviewTabs(pane.previewPaths.map((path) => ({ path })));
        setExpandedDirs(pane.expandedDirs);
        previewCache.current.clear();
        pendingRestore.current = pane.previewPath || pane.previewPaths.at(-1) || null;
      }
    }
    return () => ac.abort();
  }, [deps.ownerKey, deps.disabled]);

  useEffect(() => {
    if (skipRemember.current) {
      skipRemember.current = false;
      return;
    }
    tabMemory.current = rememberReviewTab(tabMemory.current, rememberedOwner.current, state.tab);
    lastTab.current = state.tab;
  }, [state.tab]);

  const openReview = useCallback((action: ReviewOpenAction) => {
    if (deps.disabled) return;
    dispatch({ type: "open", action });
    deps.onOpened?.();
  }, [deps.disabled, deps.onOpened]);

  const revealPath = useCallback(async (path: string) => {
    const resolvedPath = resolveReviewPath(path, deps.cwd);
    const error = validateReviewFallbackTarget(resolvedPath, deps.cwd, deps.locale);
    if (error) { deps.onError(error); return; }
    try { await deps.openReviewPath(resolvedPath, deps.cwd); } catch (reason) { deps.onError(previewErrorCopy(reason)); }
  }, [deps.cwd, deps.locale, deps.onError, deps.openReviewPath]);

  const openPreview = useCallback(async (path: string, opts?: { silent?: boolean }) => {
    if (deps.disabled) return;
    const silent = opts?.silent === true;
    const resolvedPath = resolveReviewPath(path, deps.cwd);
    const kind = previewKind(resolvedPath);
    if (kind === "image" || kind === "video") {
      setPreviewTabs((tabs) => upsertPreviewTab(tabs, resolvedPath));
      dispatch({ type: "preview-start", path: resolvedPath, requestId: ++requestId.current, silent });
      if (!silent) deps.onOpened?.();
      return;
    }
    if (!deps.isTextPreviewable(resolvedPath)) {
      if (silent) return;
      dispatch({ type: "preview-invalidate", requestId: ++requestId.current });
      const error = validateReviewFallbackTarget(resolvedPath, deps.cwd, deps.locale);
      if (error) { deps.onError(error); return; }
      try { await deps.openReviewPath(resolvedPath, deps.cwd); } catch (reason) { deps.onError(previewErrorCopy(reason)); }
      return;
    }
    setPreviewTabs((tabs) => upsertPreviewTab(tabs, resolvedPath));
    const cached = previewCache.current.get(resolvedPath);
    const id = ++requestId.current;
    const requestOwner = deps.ownerKey;
    dispatch({ type: "preview-start", path: resolvedPath, requestId: id, silent });
    if (cached) {
      dispatch({ type: "preview-success", requestId: id, path: resolvedPath, text: cached.text, truncated: false });
    }
    if (!silent) deps.onOpened?.();
    const signal = abortRef.current?.signal;
    try {
      const row = await deps.readTextFile(resolvedPath, deps.cwd || null);
      if (signal?.aborted || ownerKey.current !== requestOwner) return;
      putPreviewCache(previewCache.current, row.path, row.text);
      dispatch({ type: "preview-success", requestId: id, path: row.path, text: row.text, truncated: row.truncated });
    } catch (error) {
      if (signal?.aborted || ownerKey.current !== requestOwner) return;
      if (cached) return;
      dispatch({ type: "preview-error", requestId: id, error: previewErrorCopy(error) });
    }
  }, [deps.cwd, deps.disabled, deps.isTextPreviewable, deps.locale, deps.onError, deps.onOpened, deps.openReviewPath, deps.ownerKey, deps.readTextFile]);

  const selectPreviewTab = useCallback((path: string) => {
    const cached = previewCache.current.get(path);
    if (cached) {
      const id = ++requestId.current;
      dispatch({ type: "preview-start", path, requestId: id });
      dispatch({ type: "preview-success", requestId: id, path, text: cached.text, truncated: false });
      return;
    }
    void openPreview(path);
  }, [openPreview]);

  useEffect(() => {
    openPreviewRef.current = openPreview;
  }, [openPreview]);

  useEffect(() => {
    const path = pendingRestore.current;
    pendingRestore.current = null;
    if (!path || deps.disabled) return;
    void openPreviewRef.current(path, { silent: true });
  }, [deps.ownerKey, deps.disabled]);

  const onToggleExplorerDir = useCallback((path: string) => {
    setExpandedDirs((dirs) => toggleExplorerDir(dirs, path));
  }, []);

  const closePreviewTab = useCallback((path: string) => {
    const nextActive = activeTabAfterClose(previewTabs, path, state.preview.path);
    setPreviewTabs((tabs) => removePreviewTab(tabs, path));
    previewCache.current.delete(path);
    if (state.preview.path !== path) return;
    if (nextActive) {
      void selectPreviewTab(nextActive);
      return;
    }
    dispatch({ type: "preview-start", path: "", requestId: ++requestId.current });
  }, [previewTabs, selectPreviewTab, state.preview.path]);

  const previewTabsMemo = useMemo(() => previewTabs, [previewTabs]);

  return {
    open: state.open,
    tab: state.tab,
    detailsTool: state.detailsTool,
    preview: state.preview,
    openReview,
    openTurnFile: openPreview,
    openPreview,
    inspectTool: (tool) => {
      if (deps.disabled) return;
      dispatch({ type: "details", tool });
      deps.onOpened?.();
    },
    revealPath,
    close: () => dispatch({ type: "close" }),
    toggle: (defaultTab) => { if (!deps.disabled) dispatch({ type: "toggle", defaultTab }); },
    setTab: (tab) => dispatch({ type: "tab", tab }),
    hydrateLegacy: (value) => dispatch({ type: "hydrate-legacy", ...value }),
    setPreviewText: (path, id, text) => {
      putPreviewCache(previewCache.current, path, text);
      dispatch({ type: "preview-text", path, requestId: id, text });
    },
    previewTabs: previewTabsMemo,
    selectPreviewTab,
    closePreviewTab,
    expandedDirs,
    toggleExplorerDir: onToggleExplorerDir,
  };
}
