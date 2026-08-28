import { frecencyScore, type FrecencyMap } from "./frecency";
import { basename } from "./text";
import { displayTitle } from "./projects";

export type PaletteGroup = "操作" | "会话" | "项目" | "命令";

export type PaletteItem = {
  id: string;
  label: string;
  hint?: string;
  group: PaletteGroup;
};

export type PaletteSession = { id: string; cwd: string; title: string };
export type PaletteCommand = { name: string; hint?: string };

export type PaletteSources = {
  sessions: PaletteSession[];
  projects: string[];
  commands: PaletteCommand[];
  titles: Record<string, string>;
  cwd: string;
  isRepo: boolean;
};

export type PaletteAction =
  | { kind: "session"; id: string }
  | { kind: "project"; path: string }
  | { kind: "slash"; name: string }
  | { kind: "act"; act: string };

const CORE_ACTIONS: PaletteItem[] = [
  { id: "act:new-chat", label: "新对话", group: "操作", hint: "不绑目录" },
  { id: "act:new-session", label: "在当前项目新开会话", group: "操作" },
  { id: "act:settings", label: "打开设置", group: "操作" },
  { id: "act:hub-skills", label: "扩展中心 · 技能", group: "操作", hint: "/skills" },
  { id: "act:hub-mcp", label: "扩展中心 · MCP", group: "操作", hint: "/mcps" },
  { id: "act:hub-plugins", label: "扩展中心 · 插件", group: "操作", hint: "/plugins" },
  { id: "act:hub-hooks", label: "扩展中心 · Hooks", group: "操作", hint: "/hooks" },
  { id: "act:hub-market", label: "扩展中心 · 市场", group: "操作", hint: "/marketplace" },
  { id: "act:fork", label: "分叉会话", group: "操作", hint: "/fork" },
  { id: "act:export", label: "导出会话", group: "操作", hint: "/export" },
  { id: "act:theme", label: "切换浅色 / 深色", group: "操作" },
  { id: "act:panel", label: "审阅", group: "操作" },
  { id: "act:context", label: "计划与规则", group: "操作" },
  { id: "act:dashboard", label: "会话总览", group: "操作" },
  { id: "act:imagine", label: "图片", group: "操作" },
  { id: "act:agents", label: "代理", group: "操作" },
  { id: "act:memory", label: "记忆", group: "操作" },
  { id: "act:usage", label: "用量", group: "操作" },
  { id: "act:add-project", label: "添加项目…", group: "操作" },
];

export function buildPaletteItems(source: PaletteSources): PaletteItem[] {
  const out: PaletteItem[] = [...CORE_ACTIONS];
  if (source.isRepo) {
    out.push({ id: "act:worktree", label: "在新 worktree 里开会话", group: "操作" });
  }
  if (source.cwd) out.push({ id: "act:finder", label: "在访达中打开工作目录", group: "操作" });
  for (const s of source.sessions.slice(0, 60)) {
    out.push({
      id: `session:${s.id}`,
      label: displayTitle(s, source.titles),
      hint: basename(s.cwd),
      group: "会话",
    });
  }
  for (const p of source.projects) {
    out.push({ id: `project:${p}`, label: basename(p), hint: p, group: "项目" });
  }
  for (const c of source.commands) {
    out.push({ id: `slash:${c.name}`, label: c.name, hint: c.hint, group: "命令" });
  }
  return out;
}

/** Parse a palette row id (`act:new-chat`, `session:…`) into a typed action. */
export function parsePaletteAction(id: string): PaletteAction | null {
  const [kind, ...rest] = id.split(":");
  const arg = rest.join(":");
  if (!kind || !arg) return null;
  if (kind === "session") return { kind: "session", id: arg };
  if (kind === "project") return { kind: "project", path: arg };
  if (kind === "slash") return { kind: "slash", name: arg };
  if (kind === "act") return { kind: "act", act: arg };
  return null;
}

const GROUP_ORDER: PaletteGroup[] = ["操作", "会话", "项目", "命令"];

function subsequence(haystack: string, needle: string): boolean {
  let i = 0;
  for (const ch of haystack) {
    if (ch === needle[i]) i++;
    if (i === needle.length) return true;
  }
  return needle.length === 0;
}

/**
 * Higher is better. `null` means no match.
 * Prefix beats substring beats subsequence; a hint match always ranks below
 * any label match so typing a session name never surfaces a command first.
 */
export function scoreItem(item: PaletteItem, query: string): number | null {
  const q = query.trim().toLowerCase();
  if (!q) return 0;
  const label = item.label.toLowerCase();
  if (label.startsWith(q)) return 1000 - label.length;
  const at = label.indexOf(q);
  if (at >= 0) return 600 - at;
  const hint = (item.hint ?? "").toLowerCase();
  if (hint.includes(q)) return 200;
  if (subsequence(label, q)) return 100;
  return null;
}

export function filterPalette(
  items: PaletteItem[],
  query: string,
  limit = 40,
  frecency?: FrecencyMap,
  now = Date.now(),
): PaletteItem[] {
  const scored: { item: PaletteItem; score: number; order: number }[] = [];
  items.forEach((item, order) => {
    const score = scoreItem(item, query);
    if (score === null) return;
    scored.push({ item, score, order });
  });
  const q = query.trim();
  scored.sort((a, b) => {
    if (frecency) {
      const fa = frecencyScore(frecency[a.item.id]?.uses ?? 0, frecency[a.item.id]?.lastAt ?? 0, now);
      const fb = frecencyScore(frecency[b.item.id]?.uses ?? 0, frecency[b.item.id]?.lastAt ?? 0, now);
      if (fb !== fa) return fb - fa;
    }
    if (!q) {
      const g = GROUP_ORDER.indexOf(a.item.group) - GROUP_ORDER.indexOf(b.item.group);
      if (g !== 0) return g;
      return a.order - b.order;
    }
    if (b.score !== a.score) return b.score - a.score;
    return a.order - b.order;
  });
  return scored.slice(0, limit).map((s) => s.item);
}

export type PaletteKeyState = {
  index: number;
  hits: PaletteItem[];
  query: string;
};

export type PaletteKeyNext = PaletteKeyState & {
  action: "none" | "close" | "pick" | "search";
  id?: string;
  search?: string;
};

export function paletteKey(state: PaletteKeyState, key: string): PaletteKeyNext {
  if (key === "Escape") return { ...state, action: "close" };
  if (key === "ArrowDown") {
    return { ...state, index: clampIndex(state.index + 1, state.hits.length), action: "none" };
  }
  if (key === "ArrowUp") {
    return { ...state, index: clampIndex(state.index - 1, state.hits.length), action: "none" };
  }
  if (key === "Enter") {
    const result = paletteSubmit(state.query, state.hits, state.index);
    if (result.kind === "pick") return { ...state, action: "pick", id: result.id };
    if (result.kind === "search") return { ...state, action: "search", search: result.query };
    return { ...state, action: "none" };
  }
  return { ...state, action: "none" };
}

export function paletteSubmit(
  query: string,
  hits: PaletteItem[],
  index: number,
): { kind: "pick"; id: string } | { kind: "search"; query: string } | { kind: "none" } {
  const hit = hits[index];
  if (hit) return { kind: "pick", id: hit.id };
  const q = query.trim();
  if (q.length >= 2) return { kind: "search", query: q };
  return { kind: "none" };
}

/** Clamp the highlighted row when the filtered list shrinks. */
export function clampIndex(index: number, length: number): number {
  if (length <= 0) return 0;
  if (index < 0) return length - 1;
  if (index >= length) return 0;
  return index;
}
