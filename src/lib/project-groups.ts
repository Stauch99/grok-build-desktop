import { normalizeCwd } from "./inbox";

export type ProjectGroup = {
  id: string;
  name: string;
};

export type ProjectGroupState = {
  groups: ProjectGroup[];
  membership: Record<string, string>;
};

export const EMPTY_PROJECT_GROUPS: ProjectGroupState = { groups: [], membership: {} };

export const DEFAULT_GROUP_NAME = "新分组";

export function nextGroupName(names: string[], base = DEFAULT_GROUP_NAME): string {
  if (!names.includes(base)) return base;
  let n = 2;
  while (names.includes(`${base} ${n}`)) n += 1;
  return `${base} ${n}`;
}

export function newGroupId(): string {
  return `g_${Date.now().toString(36)}_${Math.random().toString(36).slice(2, 8)}`;
}

export function createProjectGroup(
  state: ProjectGroupState,
  name: string,
  id = newGroupId(),
): { state: ProjectGroupState; id: string } {
  const trimmed = name.trim() || nextGroupName(state.groups.map((g) => g.name));
  return {
    id,
    state: { ...state, groups: [...state.groups, { id, name: trimmed }] },
  };
}

export function renameProjectGroup(state: ProjectGroupState, id: string, name: string): ProjectGroupState {
  const trimmed = name.trim();
  if (!trimmed) return state;
  return {
    ...state,
    groups: state.groups.map((g) => (g.id === id ? { ...g, name: trimmed } : g)),
  };
}

export function deleteProjectGroup(state: ProjectGroupState, id: string): ProjectGroupState {
  const membership: Record<string, string> = {};
  for (const [path, groupId] of Object.entries(state.membership)) {
    if (groupId !== id) membership[path] = groupId;
  }
  return { groups: state.groups.filter((g) => g.id !== id), membership };
}

export function assignProjectToGroup(state: ProjectGroupState, path: string, groupId: string): ProjectGroupState {
  if (!state.groups.some((g) => g.id === groupId)) return state;
  const key = normalizeCwd(path);
  if (!key) return state;
  return { ...state, membership: { ...state.membership, [key]: groupId } };
}

export function ungroupProject(state: ProjectGroupState, path: string): ProjectGroupState {
  const key = normalizeCwd(path);
  if (!(key in state.membership)) return state;
  const membership = { ...state.membership };
  delete membership[key];
  return { ...state, membership };
}

export function groupIdFor(state: ProjectGroupState, path: string): string | undefined {
  return state.membership[normalizeCwd(path)];
}

export function pruneProjectGroups(state: ProjectGroupState, livePaths: string[]): ProjectGroupState {
  const live = new Set(livePaths.map((p) => normalizeCwd(p)));
  const ids = new Set(state.groups.map((g) => g.id));
  const membership: Record<string, string> = {};
  for (const [path, groupId] of Object.entries(state.membership)) {
    if (live.has(path) && ids.has(groupId)) membership[path] = groupId;
  }
  return { groups: state.groups, membership };
}

export function loadProjectGroups(raw: unknown): ProjectGroupState {
  if (!raw || typeof raw !== "object") return EMPTY_PROJECT_GROUPS;
  const o = raw as Record<string, unknown>;
  const groups: ProjectGroup[] = [];
  const seen = new Set<string>();
  if (Array.isArray(o.groups)) {
    for (const row of o.groups) {
      if (!row || typeof row !== "object") continue;
      const r = row as Record<string, unknown>;
      if (typeof r.id !== "string" || !r.id || seen.has(r.id)) continue;
      if (typeof r.name !== "string" || !r.name.trim()) continue;
      seen.add(r.id);
      groups.push({ id: r.id, name: r.name.trim() });
    }
  }
  const membership: Record<string, string> = {};
  if (o.membership && typeof o.membership === "object") {
    for (const [path, groupId] of Object.entries(o.membership as Record<string, unknown>)) {
      if (typeof groupId !== "string" || !seen.has(groupId)) continue;
      const key = normalizeCwd(path);
      if (key) membership[key] = groupId;
    }
  }
  return { groups, membership };
}

export function groupBandId(groupId: string): string {
  return `group:${groupId}`;
}

export function parseGroupBandId(bandId: string): string | null {
  return bandId.startsWith("group:") ? bandId.slice(6) : null;
}

export type ProjectDropTarget = { kind: "group"; id: string } | { kind: "ungrouped" };

export function dropTargetFromAttr(value: string | null): ProjectDropTarget | null {
  if (value === "ungrouped") return { kind: "ungrouped" };
  if (!value) return null;
  const id = parseGroupBandId(value);
  return id ? { kind: "group", id } : null;
}
