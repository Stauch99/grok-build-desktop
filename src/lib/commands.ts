export type HubTab = "skills" | "mcp" | "marketplace" | "hooks";
export const HUB_TABS: HubTab[] = ["skills", "mcp", "marketplace", "hooks"];

export type CommandDef = {
  name: string;
  hint: string;
  local?:
    | "new"
    | "settings"
    | "delete"
    | "plan"
    | "yolo"
    | "auto"
    | "copy"
    | "rename"
    | "hub"
    | "export"
    | "session-info"
    | "fork"
    | "dashboard"
    | "imagine"
    | "imagine-video"
    | "agents"
    | "memory"
    | "dream"
    | "rewind";
  hubTab?: HubTab;
};

export type RenameArgs =
  | { kind: "edit" }
  | { kind: "auto" }
  | { kind: "title"; title: string }
  | { kind: "error"; message: string };

export function parseRenameArgs(rest: string): RenameArgs {
  const t = rest.trim();
  if (!t) return { kind: "edit" };
  if (t === "--auto") return { kind: "auto" };
  if (t.startsWith("--auto ") || t.startsWith("--auto\t")) {
    return { kind: "error", message: "/rename --auto 不能带标题" };
  }
  return { kind: "title", title: t.slice(0, 80) };
}

export const SLASH_COMMANDS: CommandDef[] = [
  { name: "/new", hint: "新开会话", local: "new" },
  { name: "/compact", hint: "压缩上下文" },
  { name: "/context", hint: "查看上下文占用" },
  { name: "/session-info", hint: "会话状态", local: "session-info" },
  { name: "/fork", hint: "分叉当前会话", local: "fork" },
  { name: "/rewind", hint: "回到上一轮对话", local: "rewind" },
  { name: "/delete", hint: "删除当前会话", local: "delete" },
  { name: "/rename", hint: "重命名会话", local: "rename" },
  { name: "/model", hint: "切换模型" },
  { name: "/effort", hint: "推理力度 low/medium/high/xhigh" },
  { name: "/always-approve", hint: "始终批准", local: "yolo" },
  { name: "/auto", hint: "回到 Agent", local: "auto" },
  { name: "/plan", hint: "进入计划模式", local: "plan" },
  { name: "/view-plan", hint: "查看当前计划" },
  { name: "/remember", hint: "写入一条记忆" },
  { name: "/memory", hint: "记忆", local: "memory" },
  { name: "/flush", hint: "立刻写入记忆" },
  { name: "/dream", hint: "整理记忆", local: "dream" },
  { name: "/skills", hint: "技能列表", local: "hub", hubTab: "skills" },
  { name: "/mcps", hint: "MCP 服务器", local: "hub", hubTab: "mcp" },
  { name: "/hooks", hint: "Hooks", local: "hub", hubTab: "hooks" },
  { name: "/plugins", hint: "技能", local: "hub", hubTab: "skills" },
  { name: "/marketplace", hint: "市场", local: "hub", hubTab: "marketplace" },
  { name: "/imagine", hint: "图片", local: "imagine" },
  { name: "/imagine-video", hint: "视频", local: "imagine-video" },
  { name: "/dashboard", hint: "会话总览", local: "dashboard" },
  { name: "/export", hint: "导出会话", local: "export" },
  { name: "/copy", hint: "复制上一条回复", local: "copy" },
  { name: "/config-agents", hint: "代理", local: "agents" },
  { name: "/settings", hint: "打开设置", local: "settings" },
];

export function filterCommands(query: string, extra: { name: string; hint?: string }[] = []): CommandDef[] {
  const q = query.replace(/^\//, "").toLowerCase();
  const extras: CommandDef[] = extra
    .filter((c) => c.name)
    .map((c) => ({ name: c.name.startsWith("/") ? c.name : `/${c.name}`, hint: c.hint || "" }));
  const seen = new Set<string>();
  const all = [...extras, ...SLASH_COMMANDS].filter((c) => {
    if (seen.has(c.name)) return false;
    seen.add(c.name);
    return true;
  });
  if (!q) return all.slice(0, 16);
  return all.filter((c) => c.name.slice(1).includes(q) || c.hint.toLowerCase().includes(q)).slice(0, 16);
}
