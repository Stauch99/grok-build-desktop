/** Pure helpers. Port to src/lib/{projects,commands,rail}.ts unchanged. */

export function basename(path) {
  return path.replace(/\/+$/, "").split("/").pop() || path;
}

export function displayTitle(s, titles = {}) {
  const o = titles[s.id]?.trim();
  return o || s.title || "未命名会话";
}

export function setTitleOverride(titles, id, title) {
  const t = title.trim().slice(0, 80);
  if (!t) {
    const next = { ...titles };
    delete next[id];
    return next;
  }
  return { ...titles, [id]: t };
}

export function groupSessions(projects, sessions) {
  return projects.map((path) => ({
    path,
    name: basename(path),
    sessions: sessions
      .filter((s) => s.cwd === path)
      .sort((a, b) => b.updatedAt.localeCompare(a.updatedAt)),
  }));
}

export function filterProjectTree(tree, query, titles = {}) {
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

export function parseRenameArgs(rest) {
  const t = rest.trim();
  if (!t) return { kind: "edit" };
  if (t === "--auto") return { kind: "auto" };
  if (t.startsWith("--auto ") || t.startsWith("--auto\t")) {
    return { kind: "error", message: "/rename --auto 不能带标题" };
  }
  return { kind: "title", title: t.slice(0, 80) };
}

export function progressPresentation(plan) {
  return plan.length === 0 ? { kind: "empty" } : { kind: "list", entries: plan };
}

export function partitionWorkspace(entries) {
  const byName = (a, b) => a.name.localeCompare(b.name, "zh");
  return {
    dirs: entries.filter((e) => e.kind === "dir").sort(byName),
    files: entries.filter((e) => e.kind === "file").sort(byName),
  };
}

export const SLASH_COMMANDS = [
  { name: "/new", hint: "新开会话", local: "new" },
  { name: "/delete", hint: "删除当前会话", local: "delete" },
  { name: "/rename", hint: "重命名会话", local: "rename" },
  { name: "/always-approve", hint: "始终批准", local: "yolo" },
  { name: "/auto", hint: "回到 Agent", local: "auto" },
  { name: "/plan", hint: "进入计划模式", local: "plan" },
  { name: "/settings", hint: "打开设置", local: "settings" },
  { name: "/model", hint: "切换本会话模型" },
  { name: "/compact", hint: "压缩上下文" },
];

export function filterCommands(query) {
  const q = query.replace(/^\//, "").toLowerCase();
  if (!q) return SLASH_COMMANDS.slice(0, 12);
  return SLASH_COMMANDS.filter(
    (c) => c.name.slice(1).includes(q) || c.hint.toLowerCase().includes(q),
  ).slice(0, 12);
}

export const MODE_OPTIONS = [
  { id: "agent", label: "Agent", hint: "正常执行，按许可询问" },
  { id: "plan", label: "Plan", hint: "先出方案，改代码前停" },
  { id: "yolo", label: "始终批准", hint: "本轮跳过许可卡" },
];

export function modeLabel(mode) {
  if (mode === "plan") return "Plan";
  if (mode === "yolo") return "始终批准";
  return "Agent";
}

export function slashForMode(mode) {
  if (mode === "plan") return "/plan";
  if (mode === "yolo") return "/always-approve";
  return "/auto";
}

export function nextMode(mode) {
  if (mode === "agent") return "plan";
  if (mode === "plan") return "yolo";
  return "agent";
}

export const MODEL_CATALOG = ["grok-4.6", "grok-4.5", "grok-build"];
