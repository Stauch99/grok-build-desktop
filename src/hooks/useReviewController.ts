import { useCallback, useEffect, useReducer, useRef } from "react";
import type { TextFilePreview } from "../api";
import {
  initialReviewState,
  reviewReducer,
  type LegacyReviewTab,
  type ReviewDetailsTool,
  type ReviewOpenAction,
  type ReviewTab,
} from "../lib/review-rail";
import { previewErrorCopy, previewKind } from "../lib/preview";

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
};

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
  const requestId = useRef(0);
  const ownerKey = useRef(deps.ownerKey);
  ownerKey.current = deps.ownerKey;

  useEffect(() => {
    requestId.current += 1;
    dispatch({ type: "owner-change", requestId: requestId.current, disabled: deps.disabled });
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
    const id = ++requestId.current;
    const requestOwner = deps.ownerKey;
    dispatch({ type: "preview-start", path: resolvedPath, requestId: id });
    deps.onOpened?.();
    try {
      const row = await deps.readTextFile(resolvedPath, deps.cwd || null);
      if (ownerKey.current !== requestOwner) return;
      dispatch({ type: "preview-success", requestId: id, path: row.path, text: row.text, truncated: row.truncated });
    } catch (error) {
      if (ownerKey.current !== requestOwner) return;
      dispatch({ type: "preview-error", requestId: id, error: previewErrorCopy(error) });
    }
  }, [deps.cwd, deps.disabled, deps.isTextPreviewable, deps.onError, deps.onOpened, deps.openReviewPath, deps.ownerKey, deps.readTextFile]);

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
    setPreviewText: (path, id, text) => dispatch({ type: "preview-text", path, requestId: id, text }),
  };
}
