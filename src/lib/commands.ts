import { tr } from "./i18n-bridge";

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
    return { kind: "error", message: tr("slash.renameAutoError") };
  }
  return { kind: "title", title: t.slice(0, 80) };
}

export const SLASH_COMMANDS: CommandDef[] = [
  { name: "/new", hint: "", local: "new" },
  { name: "/compact", hint: "" },
  { name: "/context", hint: "" },
  { name: "/session-info", hint: "", local: "session-info" },
  { name: "/fork", hint: "", local: "fork" },
  { name: "/rewind", hint: "", local: "rewind" },
  { name: "/delete", hint: "", local: "delete" },
  { name: "/rename", hint: "", local: "rename" },
  { name: "/model", hint: "" },
  { name: "/effort", hint: "" },
  { name: "/always-approve", hint: "", local: "yolo" },
  { name: "/auto", hint: "", local: "auto" },
  { name: "/plan", hint: "", local: "plan" },
  { name: "/view-plan", hint: "" },
  { name: "/remember", hint: "" },
  { name: "/memory", hint: "", local: "memory" },
  { name: "/flush", hint: "" },
  { name: "/dream", hint: "", local: "dream" },
  { name: "/skills", hint: "", local: "hub", hubTab: "skills" },
  { name: "/mcps", hint: "", local: "hub", hubTab: "mcp" },
  { name: "/hooks", hint: "", local: "hub", hubTab: "hooks" },
  { name: "/plugins", hint: "", local: "hub", hubTab: "skills" },
  { name: "/marketplace", hint: "", local: "hub", hubTab: "marketplace" },
  { name: "/imagine", hint: "", local: "imagine" },
  { name: "/imagine-video", hint: "", local: "imagine-video" },
  { name: "/dashboard", hint: "", local: "dashboard" },
  { name: "/export", hint: "", local: "export" },
  { name: "/copy", hint: "", local: "copy" },
  { name: "/config-agents", hint: "", local: "agents" },
  { name: "/settings", hint: "", local: "settings" },
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
  }).map((c) => {
    const key = `slash.hint.${c.name.replace(/^\//, "")}`;
    const hint = tr(key);
    return hint && hint !== key ? { ...c, hint } : c;
  });
  if (!q) return all.slice(0, 48);
  return all.filter((c) => c.name.slice(1).includes(q) || c.hint.toLowerCase().includes(q)).slice(0, 48);
}
