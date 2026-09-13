import type { SessionNode } from "./projects";

export const PROJECT_SESSION_INITIAL = 6;
export const PROJECT_SESSION_PAGE = 5;
export const PROJECT_SESSION_REMAINDER = 4;

export type ProjectSessionWindow = {
  shown: number;
  hasMore: boolean;
};

export function projectSessionWindow(total: number, extraPages: number): ProjectSessionWindow {
  if (total <= 0) return { shown: 0, hasMore: false };
  const pages = Math.max(0, extraPages);
  let shown = PROJECT_SESSION_INITIAL + pages * PROJECT_SESSION_PAGE;
  if (shown >= total) return { shown: total, hasMore: false };
  if (total - shown <= PROJECT_SESSION_REMAINDER) return { shown: total, hasMore: false };
  return { shown, hasMore: true };
}

export function extraPagesToInclude(total: number, index: number): number {
  if (index < 0) return 0;
  let extra = 0;
  for (;;) {
    const window = projectSessionWindow(total, extra);
    if (index < window.shown || !window.hasMore) return extra;
    extra += 1;
  }
}

function nodeContains(node: SessionNode, id: string): boolean {
  if (node.session.id === id) return true;
  return node.children.some((child) => nodeContains(child, id));
}

export function windowedProjectNodes(
  nodes: SessionNode[],
  extraPages: number,
  revealId?: string | null,
): { nodes: SessionNode[]; hasMore: boolean } {
  const revealIndex = revealId ? nodes.findIndex((node) => nodeContains(node, revealId)) : -1;
  const extra = Math.max(extraPages, extraPagesToInclude(nodes.length, revealIndex));
  const window = projectSessionWindow(nodes.length, extra);
  return { nodes: nodes.slice(0, window.shown), hasMore: window.hasMore };
}
