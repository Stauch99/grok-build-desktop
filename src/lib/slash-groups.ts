import type { CommandDef } from "./commands";

export type SlashGroup = "builtin" | "skill" | "plugin";

const BUILTIN = new Set([
  "new",
  "compact",
  "context",
  "session-info",
  "status",
  "info",
  "fork",
  "rewind",
  "undo",
  "delete",
  "rename",
  "model",
  "effort",
  "always-approve",
  "auto",
  "plan",
  "view-plan",
  "remember",
  "memory",
  "flush",
  "dream",
  "skills",
  "hooks",
  "plugins",
  "marketplace",
  "mcps",
  "mcp",
  "imagine",
  "imagine-video",
  "loop",
  "goal",
  "dashboard",
  "settings",
  "export",
  "copy",
  "create-skill",
  "config-agents",
  "agents",
  "personas",
  "workflows",
  "hooks-trust",
]);

export function commandGroup(cmd: CommandDef): SlashGroup {
  const bare = cmd.name.replace(/^\//, "");
  if (cmd.local) return "builtin";
  if (bare.includes(":")) return "plugin";
  if (BUILTIN.has(bare)) return "builtin";
  if (cmd.hint.toLowerCase().includes("plugin")) return "plugin";
  return "skill";
}

export function groupSlashCommands(cmds: CommandDef[]): Array<{ group: SlashGroup; items: CommandDef[] }> {
  const order: SlashGroup[] = ["builtin", "skill", "plugin"];
  const buckets = new Map<SlashGroup, CommandDef[]>();
  for (const cmd of cmds) {
    const g = commandGroup(cmd);
    const list = buckets.get(g) ?? [];
    list.push(cmd);
    buckets.set(g, list);
  }
  return order
    .filter((g) => (buckets.get(g) ?? []).length > 0)
    .map((group) => ({ group, items: buckets.get(group) ?? [] }));
}

export type HubTab = "skills" | "mcp" | "marketplace" | "hooks";

export function hubTabForSlash(name: string): HubTab | null {
  const bare = name.replace(/^\//, "").toLowerCase();
  if (bare === "skills" || bare === "create-skill" || bare === "plugins") return "skills";
  if (bare === "mcps" || bare === "mcp") return "mcp";
  if (bare === "marketplace") return "marketplace";
  if (bare === "hooks" || bare === "hooks-trust") return "hooks";
  return null;
}
