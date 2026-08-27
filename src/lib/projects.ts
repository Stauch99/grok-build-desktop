import type { SessionSummary } from "../api";
import { basename } from "./text";

export type ProjectNode = {
  path: string;
  name: string;
  sessions: SessionSummary[];
};

export function mergeProjectPaths(saved: string[], discovered: string[]): string[] {
  const out: string[] = [];
  const seen = new Set<string>();
  for (const p of [...saved, ...discovered]) {
    const n = p.replace(/\/+$/, "");
    if (!n || seen.has(n)) continue;
    seen.add(n);
    out.push(n);
  }
  return out.sort((a, b) => basename(a).localeCompare(basename(b), "zh"));
}

export type SessionNode = {
  session: SessionSummary;
  children: SessionNode[];
};

export function nestByParent(sessions: SessionSummary[]): SessionNode[] {
  const byId = new Map(sessions.map((s) => [s.id, s]));
  const kids = new Map<string, SessionSummary[]>();
  for (const s of sessions) {
    const pid = s.parentSessionId;
    if (pid && pid !== s.id && byId.has(pid)) {
      const list = kids.get(pid) ?? [];
      list.push(s);
      kids.set(pid, list);
    }
  }
  const attached = new Set([...kids.values()].flat().map((s) => s.id));
  const sort = (xs: SessionSummary[]) => [...xs].sort((a, b) => b.updatedAt.localeCompare(a.updatedAt));
  const build = (s: SessionSummary): SessionNode => ({
    session: s,
    children: sort(kids.get(s.id) ?? []).map(build),
  });
  return sort(sessions.filter((s) => !attached.has(s.id))).map(build);
}

export function countDescendants(node: SessionNode): number {
  return node.children.reduce((n, child) => n + 1 + countDescendants(child), 0);
}

export function groupSessions(projects: string[], sessions: SessionSummary[]): ProjectNode[] {
  return projects.map((path) => ({
    path,
    name: basename(path),
    sessions: sessions
      .filter((s) => s.cwd === path)
      .sort((a, b) => b.updatedAt.localeCompare(a.updatedAt)),
  }));
}

export function displayTitle(
  s: { id: string; title: string },
  titles: Record<string, string> = {},
): string {
  const o = titles[s.id]?.trim();
  return o || s.title || "未命名会话";
}

export function setTitleOverride(
  titles: Record<string, string>,
  id: string,
  title: string,
): Record<string, string> {
  const t = title.trim().slice(0, 80);
  if (!t) {
    const next = { ...titles };
    delete next[id];
    return next;
  }
  return { ...titles, [id]: t };
}

export function filterProjectTree(
  tree: ProjectNode[],
  query: string,
  titles: Record<string, string> = {},
): ProjectNode[] {
  const q = query.trim().toLowerCase();
  if (!q) return tree;
  return tree
    .map((p) => {
      if (p.name.toLowerCase().includes(q)) return p;
      return {
        ...p,
        sessions: p.sessions.filter((s) => {
          const name = displayTitle(s, titles).toLowerCase();
          return name.includes(q) || s.title.toLowerCase().includes(q);
        }),
      };
    })
    .filter((p) => p.name.toLowerCase().includes(q) || p.sessions.length > 0);
}
