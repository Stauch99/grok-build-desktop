import { useCallback, useEffect, useMemo, useReducer, useRef, useState } from "react";
import type { TextFilePreview } from "../api";
import {
  initialReviewState,
  reviewReducer,
  type LegacyReviewTab,
  type ReviewDetailsTool,
  type ReviewOpenAction,
  type ReviewTab,
} from "../lib/review-rail";
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
};

export function replaceAbortController(prev: AbortController | null): AbortController {
  prev?.abort();
  return new AbortController();
}

export function reviewOwnerKey(sessionId: string | null, cwd: string): string {
  return (sessionId || "") + "|" + cwd;
}

export function resolveReviewPath(path: string, cwd: string): string {
  const absolute = path.startsWith("/") || path.startsWith("\\") || /^[A-Za-z]:[\\/]/.test(path);
  if (absolute || !cwd) return path;
  const separator = cwd.includes("\\") && !cwd.includes("/") ? "\\" : "/";
  return cwd.replace(/[\\/]+$/, "") + separator + path.replace(/^[.][\\/]/, "");
}

export function validateReviewFallbackTarget(path: string, cwd: string): string | null {
  const normalized = path.replace(/\\/g, "/");
  const root = cwd.replace(/\\/g, "/").replace(/\/+$/, "");
  if (!root) return "Review 无可用工作区";
  if (/^[a-z][a-z0-9+.-]*:/i.test(normalized)) return "Review 不允许打开 URL";
  if (!(normalized === root || normalized.startsWith(root + "/"))) return "Review 目标不在当前工作区";
  if (/(^|\/)[^/]+\.app(?:\/|$)/i.test(normalized) || /\.(?:exe|com|bat|cmd|appimage|desktop)$/i.test(normalized)) return "Review 不允许打开应用或可执行文件";
  return null;
}

export function useReviewController(deps: ReviewControllerDependencies): ReviewController {
  const [state, dispatch] = useReducer(reviewReducer, initialReviewState);
  const [previewTabs, setPreviewTabs] = useState<PreviewTab[]>([]);
  const requestId = useRef(0);
  const ownerKey = useRef(deps.ownerKey);
  const abortRef = useRef<AbortController | null>(null);
  const previewCache = useRef(new Map<string, PreviewCacheEntry>());
  ownerKey.current = deps.ownerKey;

  useEffect(() => {
    abortRef.current = replaceAbortController(abortRef.current);
    const ac = abortRef.current;
    requestId.current += 1;
    dispatch({ type: "owner-change", requestId: requestId.current, disabled: deps.disabled });
    setPreviewTabs([]);
    previewCache.current.clear();
    return () => ac.abort();
  }, [deps.ownerKey, deps.disabled]);

  const openReview = useCallback((action: ReviewOpenAction) => {
    if (deps.disabled) return;
    dispatch({ type: "open", action });
    deps.onOpened?.();
  }, [deps.disabled, deps.onOpened]);

  const revealPath = useCallback(async (path: string) => {
    const resolvedPath = resolveReviewPath(path, deps.cwd);
    const error = validateReviewFallbackTarget(resolvedPath, deps.cwd);
    if (error) { deps.onError(error); return; }
    try { await deps.openReviewPath(resolvedPath, deps.cwd); } catch (reason) { deps.onError(previewErrorCopy(reason)); }
  }, [deps.cwd, deps.onError, deps.openReviewPath]);

  const openPreview = useCallback(async (path: string) => {
    if (deps.disabled) return;
    const resolvedPath = resolveReviewPath(path, deps.cwd);
    const kind = previewKind(resolvedPath);
    if (kind === "image" || kind === "video") {
      setPreviewTabs((tabs) => upsertPreviewTab(tabs, resolvedPath));
      dispatch({ type: "preview-start", path: resolvedPath, requestId: ++requestId.current });
      deps.onOpened?.();
      return;
    }
    if (!deps.isTextPreviewable(resolvedPath)) {
      dispatch({ type: "preview-invalidate", requestId: ++requestId.current });
      const error = validateReviewFallbackTarget(resolvedPath, deps.cwd);
      if (error) { deps.onError(error); return; }
      try { await deps.openReviewPath(resolvedPath, deps.cwd); } catch (reason) { deps.onError(previewErrorCopy(reason)); }
      return;
    }
    setPreviewTabs((tabs) => upsertPreviewTab(tabs, resolvedPath));
    const cached = previewCache.current.get(resolvedPath);
    const id = ++requestId.current;
    const requestOwner = deps.ownerKey;
    dispatch({ type: "preview-start", path: resolvedPath, requestId: id });
    if (cached) {
      dispatch({ type: "preview-success", requestId: id, path: resolvedPath, text: cached.text, truncated: false });
    }
    deps.onOpened?.();
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
  }, [deps.cwd, deps.disabled, deps.isTextPreviewable, deps.onError, deps.onOpened, deps.openReviewPath, deps.ownerKey, deps.readTextFile]);

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

  const closePreviewTab = useCallback((path: string) => {
    const nextActive = activeTabAfterClose(previewTabs, path, state.preview.path);
    setPreviewTabs((tabs) => removePreviewTab(tabs, path));
    previewCache.current.delete(path);
    if (state.preview.path !== path) return;
    if (nextActive) {
      const cached = previewCache.current.get(nextActive);
      const id = ++requestId.current;
      dispatch({ type: "preview-start", path: nextActive, requestId: id });
      if (cached) dispatch({ type: "preview-success", requestId: id, path: nextActive, text: cached.text, truncated: false });
      return;
    }
    dispatch({ type: "preview-start", path: "", requestId: ++requestId.current });
  }, [previewTabs, state.preview.path]);

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
  };
}
