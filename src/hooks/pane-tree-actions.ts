import type { Dispatch, MutableRefObject, SetStateAction } from "react";
import { t, type Locale } from "../lib/i18n";
import { sessionToOpen } from "../lib/live-roster";
import {
  MAIN_PANE,
  canSplit,
  closePane,
  dragStarted,
  dropZone,
  ensureMainLeaf,
  hitPane,
  layoutRects,
  leafIds,
  paneOfSession,
  previewRect,
  resolveDrop,
  setRatio,
  type Bindings,
  type PaneNode,
  type Rect,
  type ResolvedDrop,
} from "../lib/pane-tree";
import { displayTitle } from "../lib/projects";
import { basename } from "../lib/text";
import type { SessionSummary } from "../api";
import type { ExtraPaneState } from "./useAcpSession";

export type PaneDragState = {
  sessionId: string;
  title: string;
  subtitle?: string;
  x: number;
  y: number;
  preview: Rect | null;
  allowed: boolean;
  resolved: ResolvedDrop | null;
};

export type PaneTreeActionDeps = {
  paneTreeRef: MutableRefObject<PaneNode>;
  extraPanesRef: MutableRefObject<Record<string, ExtraPaneState>>;
  sessionIdRef: MutableRefObject<string | null>;
  focusedPaneIdRef: MutableRefObject<string>;
  allSessionsRef: MutableRefObject<SessionSummary[]>;
  workColRef: MutableRefObject<{ getBoundingClientRect(): DOMRect } | null>;
  titles: Record<string, string>;
  locale: Locale;
  setPaneTree: Dispatch<SetStateAction<PaneNode>>;
  setExtraPanes: Dispatch<SetStateAction<Record<string, ExtraPaneState>>>;
  setPaneDrag: Dispatch<SetStateAction<PaneDragState | null>>;
  showToast: (msg: string) => void;
  focusPane: (id: string) => void;
  applyMainFromExtra: (extra: ExtraPaneState) => void;
  liveBindings: () => Bindings;
  commitDrop: (drop: ResolvedDrop) => Promise<void>;
  startNewInPane: (paneId: string) => Promise<void>;
  startNewChat: () => Promise<void>;
};

export async function splitRight(deps: PaneTreeActionDeps, s: SessionSummary): Promise<void> {
  s = sessionToOpen(s, deps.allSessionsRef.current);
  const bindings = deps.liveBindings();
  const existing = paneOfSession(bindings, s.id);
  if (existing) {
    deps.focusPane(existing);
    return;
  }
  const target = deps.focusedPaneIdRef.current;
  const work = deps.workColRef.current?.getBoundingClientRect();
  const outer: Rect = work
    ? { left: work.left, top: work.top, right: work.right, bottom: work.bottom }
    : { left: 0, top: 0, right: 960, bottom: 720 };
  const hit = layoutRects(deps.paneTreeRef.current, outer).find((leaf) => leaf.id === target);
  const rect = hit?.rect ?? outer;
  if (!canSplit(rect, "right")) {
    deps.showToast(t(deps.locale, "pane.tooSmall"));
    return;
  }
  const drop = resolveDrop({
    tree: deps.paneTreeRef.current,
    bindings,
    sessionId: s.id,
    targetPane: target,
    zone: "right",
    targetRect: rect,
  });
  if (!drop.ok) {
    deps.showToast(t(deps.locale, "pane.tooSmall"));
    return;
  }
  await deps.commitDrop(drop);
}

export function closePaneLeaf(deps: PaneTreeActionDeps, paneId: string): void {
  const tree = deps.paneTreeRef.current;
  if (leafIds(tree).length <= 1) return;
  const closed = closePane(tree, paneId);
  if (!closed) return;
  const extras = { ...deps.extraPanesRef.current };
  if (paneId !== MAIN_PANE) delete extras[paneId];
  const ensured = ensureMainLeaf(closed.tree, {
    ...Object.fromEntries(
      leafIds(closed.tree).map((id) => [
        id,
        id === MAIN_PANE ? deps.sessionIdRef.current : extras[id]?.sessionId ?? null,
      ]),
    ),
  });
  if (ensured.retargetFrom) {
    const extra = extras[ensured.retargetFrom];
    delete extras[ensured.retargetFrom];
    if (extra) deps.applyMainFromExtra(extra);
  }
  const keep = new Set(leafIds(ensured.tree));
  for (const id of Object.keys(extras)) {
    if (!keep.has(id)) delete extras[id];
  }
  deps.setPaneTree(ensured.tree);
  deps.setExtraPanes(extras);
  const nextFocus =
    leafIds(ensured.tree).includes(deps.focusedPaneIdRef.current) && deps.focusedPaneIdRef.current !== paneId
      ? deps.focusedPaneIdRef.current
      : MAIN_PANE;
  deps.focusPane(nextFocus);
}

export async function newChatInFocus(deps: PaneTreeActionDeps): Promise<void> {
  if (deps.focusedPaneIdRef.current !== MAIN_PANE && deps.extraPanesRef.current[deps.focusedPaneIdRef.current]) {
    await deps.startNewInPane(deps.focusedPaneIdRef.current);
    return;
  }
  await deps.startNewChat();
}

export function onPaneRatio(deps: PaneTreeActionDeps, splitId: string, ratio: number): void {
  deps.setPaneTree((node) => setRatio(node, splitId, ratio));
}

export function beginPaneDrag(
  deps: PaneTreeActionDeps,
  e: { button: number; clientX: number; clientY: number },
  s: SessionSummary,
): void {
  s = sessionToOpen(s, deps.allSessionsRef.current);
  if (e.button !== 0) return;
  const startX = e.clientX;
  const startY = e.clientY;
  let started = false;
  let last: ResolvedDrop | null = null;
  const title = displayTitle(s, deps.titles);
  const subtitle = s.cwd ? basename(s.cwd) : undefined;
  const onMove = (ev: PointerEvent) => {
    if (!started && !dragStarted(ev.clientX - startX, ev.clientY - startY)) return;
    if (!started) {
      started = true;
      document.documentElement.classList.add("pane-dragging");
    }
    const work = deps.workColRef.current?.getBoundingClientRect();
    if (!work) {
      last = null;
      deps.setPaneDrag({
        sessionId: s.id,
        title,
        subtitle,
        x: ev.clientX,
        y: ev.clientY,
        preview: null,
        allowed: false,
        resolved: null,
      });
      return;
    }
    const outer = { left: work.left, top: work.top, right: work.right, bottom: work.bottom };
    const point = { x: ev.clientX, y: ev.clientY };
    const hit = hitPane(deps.paneTreeRef.current, outer, point);
    if (!hit) {
      last = null;
      deps.setPaneDrag({
        sessionId: s.id,
        title,
        subtitle,
        x: ev.clientX,
        y: ev.clientY,
        preview: null,
        allowed: false,
        resolved: null,
      });
      return;
    }
    const zone = dropZone(point, hit.rect);
    const resolved = resolveDrop({
      tree: deps.paneTreeRef.current,
      bindings: deps.liveBindings(),
      sessionId: s.id,
      targetPane: hit.id,
      zone,
      targetRect: hit.rect,
    });
    last = resolved.ok ? resolved : null;
    deps.setPaneDrag({
      sessionId: s.id,
      title,
      subtitle,
      x: ev.clientX,
      y: ev.clientY,
      preview: previewRect(hit.rect, zone),
      allowed: resolved.ok,
      resolved,
    });
  };
  const onUp = () => {
    window.removeEventListener("pointermove", onMove);
    window.removeEventListener("pointerup", onUp);
    document.documentElement.classList.remove("pane-dragging");
    const resolved = started ? last : null;
    deps.setPaneDrag(null);
    if (resolved) void deps.commitDrop(resolved);
  };
  window.addEventListener("pointermove", onMove);
  window.addEventListener("pointerup", onUp);
}
