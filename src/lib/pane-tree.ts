export const MAIN_PANE = "main";
export const PANE_MIN = { width: 280, height: 220 } as const;
export const DRAG_THRESHOLD = 12;
export const DROP_EDGE_RATIO = 0.25;
export const DROP_EDGE_CAP = 80;

export type SplitDir = "row" | "col";
export type DropZone = "center" | "left" | "right" | "top" | "bottom";
export type Rect = { left: number; top: number; right: number; bottom: number };
export type Point = { x: number; y: number };

export type PaneLeaf = { type: "leaf"; id: string };
export type PaneSplit = {
  type: "split";
  id: string;
  dir: SplitDir;
  ratio: number;
  first: PaneNode;
  second: PaneNode;
};
export type PaneNode = PaneLeaf | PaneSplit;
export type Bindings = Record<string, string | null>;

export type ResolvedDrop = {
  ok: boolean;
  kind: "cancel" | "replace" | "split" | "move-replace" | "move-split";
  sessionId: string;
  targetPane: string;
  zone: DropZone;
  fromPane: string | null;
  newPaneId?: string;
};

export function singlePane(id = MAIN_PANE): PaneLeaf {
  return { type: "leaf", id };
}

/** Strict shape check for persisted pane trees; anything odd falls back to null. */
export function parsePaneTree(value: unknown): PaneNode | null {
  const seen = new Set<string>();
  function walk(node: unknown): PaneNode | null {
    if (!node || typeof node !== "object") return null;
    const rec = node as Record<string, unknown>;
    if (rec.type === "leaf") {
      if (typeof rec.id !== "string" || !rec.id || seen.has(rec.id)) return null;
      seen.add(rec.id);
      return { type: "leaf", id: rec.id };
    }
    if (rec.type === "split") {
      if (typeof rec.id !== "string" || !rec.id) return null;
      if (rec.dir !== "row" && rec.dir !== "col") return null;
      const ratio = typeof rec.ratio === "number" && Number.isFinite(rec.ratio) ? rec.ratio : 0.5;
      const first = walk(rec.first);
      const second = walk(rec.second);
      if (!first || !second) return null;
      return { type: "split", id: rec.id, dir: rec.dir, ratio, first, second };
    }
    return null;
  }
  const tree = walk(value);
  return tree && leafIds(tree).length > 0 ? tree : null;
}

export function isLeaf(node: PaneNode): node is PaneLeaf {
  return node.type === "leaf";
}

export function leafIds(node: PaneNode): string[] {
  if (node.type === "leaf") return [node.id];
  return [...leafIds(node.first), ...leafIds(node.second)];
}

export function nextPaneId(node: PaneNode): string {
  const used = new Set(leafIds(node));
  let n = 2;
  while (used.has(`p${n}`)) n += 1;
  return `p${n}`;
}

function nextSplitId(node: PaneNode): string {
  const used = new Set<string>();
  function walk(n: PaneNode) {
    if (n.type === "split") {
      used.add(n.id);
      walk(n.first);
      walk(n.second);
    }
  }
  walk(node);
  let i = 1;
  while (used.has(`s${i}`)) i += 1;
  return `s${i}`;
}

export function splitLeaf(
  node: PaneNode,
  leafId: string,
  zone: Exclude<DropZone, "center">,
  newPaneId: string,
): PaneNode | null {
  return splitLeafAt(node, leafId, zone, newPaneId, nextSplitId(node));
}

function splitLeafAt(
  node: PaneNode,
  leafId: string,
  zone: Exclude<DropZone, "center">,
  newPaneId: string,
  splitId: string,
): PaneNode | null {
  if (node.type === "leaf") {
    if (node.id !== leafId) return null;
    const dir: SplitDir = zone === "left" || zone === "right" ? "col" : "row";
    const incoming: PaneLeaf = { type: "leaf", id: newPaneId };
    const original: PaneLeaf = { type: "leaf", id: leafId };
    const incomingFirst = zone === "left" || zone === "top";
    return {
      type: "split",
      id: splitId,
      dir,
      ratio: 0.5,
      first: incomingFirst ? incoming : original,
      second: incomingFirst ? original : incoming,
    };
  }
  const first = splitLeafAt(node.first, leafId, zone, newPaneId, splitId);
  if (first) return { ...node, first };
  const second = splitLeafAt(node.second, leafId, zone, newPaneId, splitId);
  if (second) return { ...node, second };
  return null;
}

export function retargetLeafId(node: PaneNode, fromId: string, toId: string): PaneNode {
  if (node.type === "leaf") return node.id === fromId ? { ...node, id: toId } : node;
  return {
    ...node,
    first: retargetLeafId(node.first, fromId, toId),
    second: retargetLeafId(node.second, fromId, toId),
  };
}

/** ACP's primary session always lives on `main`. After closing that leaf, retarget the survivor. */
export function ensureMainLeaf(
  node: PaneNode,
  bindings: Bindings,
): { tree: PaneNode; bindings: Bindings; retargetFrom: string | null } {
  const ids = leafIds(node);
  if (ids.includes(MAIN_PANE)) return { tree: node, bindings, retargetFrom: null };
  const from = ids[0];
  if (!from) return { tree: node, bindings, retargetFrom: null };
  const next: Bindings = { ...bindings, [MAIN_PANE]: bindings[from] ?? null };
  delete next[from];
  return { tree: retargetLeafId(node, from, MAIN_PANE), bindings: next, retargetFrom: from };
}

export function closePane(node: PaneNode, leafId: string): { tree: PaneNode; removed: string } | null {
  if (node.type === "leaf") return null;
  if (node.first.type === "leaf" && node.first.id === leafId) return { tree: node.second, removed: leafId };
  if (node.second.type === "leaf" && node.second.id === leafId) return { tree: node.first, removed: leafId };
  const first = closePane(node.first, leafId);
  if (first) return { tree: { ...node, first: first.tree }, removed: first.removed };
  const second = closePane(node.second, leafId);
  if (second) return { tree: { ...node, second: second.tree }, removed: second.removed };
  return null;
}

export function setRatio(node: PaneNode, splitId: string, ratio: number): PaneNode {
  if (node.type === "leaf") return node;
  const clamped = Math.min(0.8, Math.max(0.2, ratio));
  if (node.id === splitId) return { ...node, ratio: clamped };
  return { ...node, first: setRatio(node.first, splitId, ratio), second: setRatio(node.second, splitId, ratio) };
}

function width(r: Rect): number {
  return r.right - r.left;
}

function height(r: Rect): number {
  return r.bottom - r.top;
}

function edgeBand(size: number): number {
  return Math.min(DROP_EDGE_CAP, size * DROP_EDGE_RATIO);
}

export function dropZone(point: Point, rect: Rect): DropZone {
  const left = point.x - rect.left;
  const right = rect.right - point.x;
  const top = point.y - rect.top;
  const bottom = rect.bottom - point.y;
  const xBand = edgeBand(width(rect));
  const yBand = edgeBand(height(rect));
  const edges: { zone: Exclude<DropZone, "center">; dist: number; inBand: boolean }[] = [
    { zone: "left", dist: left, inBand: left <= xBand },
    { zone: "right", dist: right, inBand: right <= xBand },
    { zone: "top", dist: top, inBand: top <= yBand },
    { zone: "bottom", dist: bottom, inBand: bottom <= yBand },
  ];
  const hits = edges.filter((e) => e.inBand);
  if (!hits.length) return "center";
  hits.sort((a, b) => a.dist - b.dist);
  return hits[0].zone;
}

export function canSplit(rect: Rect, zone: DropZone, min: { width: number; height: number } = PANE_MIN): boolean {
  if (zone === "center") return true;
  if (zone === "left" || zone === "right") return width(rect) / 2 >= min.width;
  return height(rect) / 2 >= min.height;
}

export function previewRect(rect: Rect, zone: DropZone): Rect {
  const midX = rect.left + width(rect) / 2;
  const midY = rect.top + height(rect) / 2;
  if (zone === "left") return { ...rect, right: midX };
  if (zone === "right") return { ...rect, left: midX };
  if (zone === "top") return { ...rect, bottom: midY };
  if (zone === "bottom") return { ...rect, top: midY };
  return rect;
}

export function layoutRects(node: PaneNode, rect: Rect): { id: string; rect: Rect }[] {
  if (node.type === "leaf") return [{ id: node.id, rect }];
  if (node.dir === "col") {
    const mid = rect.left + width(rect) * node.ratio;
    return [
      ...layoutRects(node.first, { ...rect, right: mid }),
      ...layoutRects(node.second, { ...rect, left: mid }),
    ];
  }
  const mid = rect.top + height(rect) * node.ratio;
  return [
    ...layoutRects(node.first, { ...rect, bottom: mid }),
    ...layoutRects(node.second, { ...rect, top: mid }),
  ];
}

export function paneOfSession(bindings: Bindings, sessionId: string): string | null {
  for (const [paneId, id] of Object.entries(bindings)) {
    if (id === sessionId) return paneId;
  }
  return null;
}

export function dragStarted(dx: number, dy: number, threshold = DRAG_THRESHOLD): boolean {
  return dx * dx + dy * dy >= threshold * threshold;
}

export function openBySession(bindings: Bindings): Record<string, string> {
  const out: Record<string, string> = {};
  for (const [paneId, sessionId] of Object.entries(bindings)) {
    if (sessionId) out[sessionId] = paneId;
  }
  return out;
}

export function hitPane(tree: PaneNode, outer: Rect, point: Point): { id: string; rect: Rect } | null {
  for (const leaf of layoutRects(tree, outer)) {
    const r = leaf.rect;
    if (point.x >= r.left && point.x <= r.right && point.y >= r.top && point.y <= r.bottom) return leaf;
  }
  return null;
}

export function resolveDrop(opts: {
  tree: PaneNode;
  bindings: Bindings;
  sessionId: string;
  targetPane: string;
  zone: DropZone;
  targetRect: Rect;
  min?: { width: number; height: number };
}): ResolvedDrop {
  const fromPane = paneOfSession(opts.bindings, opts.sessionId);
  const base = {
    sessionId: opts.sessionId,
    targetPane: opts.targetPane,
    zone: opts.zone,
    fromPane,
  };
  if (fromPane === opts.targetPane) return { ok: false, kind: "cancel", ...base };
  if (opts.zone !== "center" && !canSplit(opts.targetRect, opts.zone, opts.min ?? PANE_MIN)) {
    return { ok: false, kind: "cancel", ...base };
  }
  if (opts.zone === "center") {
    return { ok: true, kind: fromPane ? "move-replace" : "replace", ...base };
  }
  return {
    ok: true,
    kind: fromPane ? "move-split" : "split",
    ...base,
    newPaneId: nextPaneId(opts.tree),
  };
}

function pruneBindings(tree: PaneNode, bindings: Bindings): Bindings {
  const keep = new Set(leafIds(tree));
  const next: Bindings = {};
  for (const id of keep) next[id] = Object.prototype.hasOwnProperty.call(bindings, id) ? bindings[id] : null;
  return next;
}

export function applyDrop(
  tree: PaneNode,
  bindings: Bindings,
  drop: ResolvedDrop,
): { tree: PaneNode; bindings: Bindings; focus: string } | null {
  if (!drop.ok || drop.kind === "cancel") return null;
  if (drop.kind === "replace") {
    return { tree, bindings: { ...bindings, [drop.targetPane]: drop.sessionId }, focus: drop.targetPane };
  }
  if (drop.kind === "split") {
    if (drop.zone === "center" || !drop.newPaneId) return null;
    const nextTree = splitLeaf(tree, drop.targetPane, drop.zone, drop.newPaneId);
    if (!nextTree) return null;
    return {
      tree: nextTree,
      bindings: { ...bindings, [drop.newPaneId]: drop.sessionId },
      focus: drop.newPaneId,
    };
  }
  if (drop.kind === "move-replace") {
    if (!drop.fromPane) return null;
    const closed = closePane(tree, drop.fromPane);
    if (!closed) return null;
    return {
      tree: closed.tree,
      bindings: pruneBindings(closed.tree, { ...bindings, [drop.targetPane]: drop.sessionId }),
      focus: drop.targetPane,
    };
  }
  if (drop.zone === "center" || !drop.newPaneId || !drop.fromPane) return null;
  const split = splitLeaf(tree, drop.targetPane, drop.zone, drop.newPaneId);
  if (!split) return null;
  const closed = closePane(split, drop.fromPane);
  if (!closed) return null;
  return {
    tree: closed.tree,
    bindings: pruneBindings(closed.tree, { ...bindings, [drop.newPaneId]: drop.sessionId }),
    focus: drop.newPaneId,
  };
}

/**
 * Coerce persisted bindings into the tree's leaf set: non-string or empty
 * session ids become null, and a session may bind at most one leaf (main wins).
 */
export function sanitizePaneBindings(tree: PaneNode, value: unknown): Bindings {
  const raw = value && typeof value === "object" ? (value as Record<string, unknown>) : {};
  const out: Bindings = {};
  const taken = new Set<string>();
  const claim = (id: string): string | null => {
    const sid = raw[id];
    if (typeof sid !== "string" || !sid || taken.has(sid)) return null;
    taken.add(sid);
    return sid;
  };
  // Main claims its session first so duplicates fall off the extra leaves.
  if (leafIds(tree).includes(MAIN_PANE)) out[MAIN_PANE] = claim(MAIN_PANE);
  for (const id of leafIds(tree)) {
    if (id === MAIN_PANE) continue;
    out[id] = claim(id);
  }
  return out;
}

export type PaneRestorePlan = {
  tree: PaneNode;
  bindings: Bindings;
  /** Extra leaves whose session still exists and should be re-opened. */
  open: { paneId: string; sessionId: string }[];
  /** Persisted main binding when the session still exists, else null. */
  mainSessionId: string | null;
};

/**
 * Reconcile a persisted layout against the live session list. Leaves bound to
 * sessions that are gone are closed; the main leaf always survives.
 */
export function planPaneRestore(
  tree: PaneNode,
  bindings: Bindings,
  liveSessionIds: ReadonlySet<string>,
): PaneRestorePlan {
  const ensured = ensureMainLeaf(tree, bindings);
  // Null out dead session ids; extra leaves that lose their binding are closed.
  const bound: Bindings = {};
  for (const [id, sid] of Object.entries(ensured.bindings)) {
    bound[id] = sid && liveSessionIds.has(sid) ? sid : null;
  }
  let next = ensured.tree;
  for (const id of leafIds(next)) {
    if (id === MAIN_PANE) continue;
    if (ensured.bindings[id] && !bound[id]) {
      const closed = closePane(next, id);
      if (closed) next = closed.tree;
    }
  }
  const open: { paneId: string; sessionId: string }[] = [];
  for (const id of leafIds(next)) {
    if (id === MAIN_PANE) continue;
    const sid = bound[id];
    if (sid) open.push({ paneId: id, sessionId: sid });
  }
  const mainSessionId = leafIds(next).includes(MAIN_PANE) ? bound[MAIN_PANE] ?? null : null;
  return { tree: next, bindings: pruneBindings(next, bound), open, mainSessionId };
}
