/** Normalize `grok inspect --json` into the shapes the Extensions hub consumes. */

export type InspectSource = {
  type: string;
  path?: string;
  pluginName?: string;
  plugin_name?: string;
};

export type InspectSkill = {
  name: string;
  description?: string;
  source: InspectSource | string;
  userInvocable?: boolean;
  disabled?: boolean;
  qualifiedName?: string;
};

export type InspectMcp = {
  name: string;
  transport?: string;
  target?: string;
  source?: InspectSource | string;
  compatibilityStatus?: string;
  vendor?: string;
  enabled?: boolean;
  scope?: string;
  toolCount?: number;
  tools?: string[];
};

export type InspectPlugin = {
  name: string;
  scope?: string;
  path?: string;
  enabled?: boolean;
  trusted?: boolean;
  provides?: {
    skills?: number;
    agents?: number;
    hooks?: boolean;
    mcpServers?: number;
  };
};

export type InspectHook = {
  event: string;
  hookType?: string;
  target?: string;
  source?: InspectSource | string;
  matcher?: string | null;
};

export type InspectAgent = {
  name: string;
  description?: string;
  source?: InspectSource | string;
};

export type CompatCell = {
  vendor: string;
  surface: string;
  enabled: boolean;
  source?: string;
};

export type InspectReport = {
  grokVersion?: string;
  cwd?: string;
  projectRoot?: string | null;
  projectTrusted?: boolean;
  skills: InspectSkill[];
  mcpServers: InspectMcp[];
  plugins: InspectPlugin[];
  hooks: InspectHook[];
  agents: InspectAgent[];
  marketplaces: unknown[];
  lspServers: unknown[];
  externalCompat?: { cells?: CompatCell[] };
  permissions?: Record<string, unknown>;
  projectInstructions?: unknown[];
};

export type SkillScope = "cwd" | "repo" | "user" | "bundled" | "plugin" | "compat";

export type McpBadge =
  | "toml"
  | "project"
  | "plugin"
  | "claude"
  | "cursor"
  | "mcp.json"
  | "other";

function asRecord(v: unknown): Record<string, unknown> {
  return v && typeof v === "object" && !Array.isArray(v) ? (v as Record<string, unknown>) : {};
}

export function sourceOf(raw: InspectSource | string | undefined): InspectSource {
  if (!raw) return { type: "unknown" };
  if (typeof raw === "string") return { type: raw };
  return {
    type: String(raw.type ?? "unknown"),
    path: raw.path,
    pluginName: raw.pluginName ?? raw.plugin_name,
  };
}

export function sourcePath(raw: InspectSource | string | undefined): string {
  return sourceOf(raw).path ?? "";
}

export function sourceType(raw: InspectSource | string | undefined): string {
  return sourceOf(raw).type;
}

export function skillScope(skill: InspectSkill, cwd = ""): SkillScope {
  const src = sourceOf(skill.source);
  const type = src.type.toLowerCase();
  if (type === "plugin") return "plugin";
  if (type === "bundled" || type === "builtin") return "bundled";
  if (type === "repo" || type === "project") return "repo";
  if (type === "local" || type === "cwd") return "cwd";
  if (type === "claude" || type === "cursor" || type === "compat") return "compat";
  const path = src.path ?? "";
  if (cwd && (path.startsWith(`${cwd}/.grok/`) || path.startsWith(`${cwd}/.agents/`))) return "cwd";
  if (path.includes("/.claude/") || path.includes("/.cursor/")) return "compat";
  if (type === "user" || path.includes("/.grok/skills/") || path.includes("/.agents/skills/")) {
    return "user";
  }
  return "user";
}

export const SKILL_SCOPE_ORDER: SkillScope[] = [
  "cwd",
  "repo",
  "user",
  "bundled",
  "plugin",
  "compat",
];

export function groupSkills(
  skills: InspectSkill[],
  cwd = "",
): Array<{ scope: SkillScope; items: InspectSkill[] }> {
  const buckets = new Map<SkillScope, InspectSkill[]>();
  for (const skill of skills) {
    const scope = skillScope(skill, cwd);
    const list = buckets.get(scope) ?? [];
    list.push(skill);
    buckets.set(scope, list);
  }
  return SKILL_SCOPE_ORDER.filter((scope) => (buckets.get(scope) ?? []).length > 0).map((scope) => ({
    scope,
    items: (buckets.get(scope) ?? []).slice().sort((a, b) => a.name.localeCompare(b.name)),
  }));
}

export function qualifySkillName(skill: InspectSkill, all: InspectSkill[]): string {
  if (skill.qualifiedName) return skill.qualifiedName;
  const collisions = all.filter((s) => s.name === skill.name);
  if (collisions.length <= 1) return skill.name;
  const src = sourceOf(skill.source);
  if (src.pluginName) return `${src.pluginName}:${skill.name}`;
  const scope = skillScope(skill);
  if (scope === "cwd") return `local:${skill.name}`;
  if (scope === "repo") return `repo:${skill.name}`;
  if (scope === "user") return `user:${skill.name}`;
  if (scope === "plugin") return `plugin:${skill.name}`;
  return `${scope}:${skill.name}`;
}

/** Slash names the composer can offer for installed, user-invocable skills. */
export function skillSlashCommands(skills: InspectSkill[]): { name: string; hint: string }[] {
  return skills
    .filter((skill) => skill.name.trim() && skill.disabled !== true && skill.userInvocable !== false)
    .map((skill) => ({
      name: qualifySkillName(skill, skills),
      hint: skill.description?.trim() || "技能",
    }));
}

export function mcpSourceBadge(server: InspectMcp): McpBadge {
  if (server.vendor === "claude") return "claude";
  if (server.vendor === "cursor") return "cursor";
  const src = sourceOf(server.source);
  const type = src.type.toLowerCase();
  const path = src.path ?? "";
  const lower = path.toLowerCase();
  if (type === "plugin") return "plugin";
  if (type === "mcpjson" || lower.endsWith(".mcp.json") || lower.endsWith("/mcp.json")) return "mcp.json";
  if (type === "claudejson" || lower.includes("/.claude")) return "claude";
  if (type === "cursor" || lower.includes("/.cursor")) return "cursor";
  if (type === "configtoml" || type === "toml" || lower.endsWith("config.toml")) {
    return isUserGrokConfig(path) ? "toml" : "project";
  }
  return "other";
}

/** `~/.grok/config.toml` is user scope; `<repo>/.grok/config.toml` is project. */
export function isUserGrokConfig(path: string): boolean {
  const parts = path.split("/").filter(Boolean);
  const grok = parts.lastIndexOf(".grok");
  if (grok < 0 || parts[grok + 1] !== "config.toml") return false;
  // /Users/<name>/.grok/config.toml or /home/<name>/.grok/config.toml
  if (grok === 2 && (parts[0] === "Users" || parts[0] === "home")) return true;
  if (grok === 1 && parts[0] === "root") return true;
  return false;
}

export function mcpHealthLabel(input: {
  enabled?: boolean;
  healthy?: boolean | null;
  disabled?: boolean;
}): "Connected" | "Failed" | "Disabled" | "Unknown" {
  if (input.disabled || input.enabled === false) return "Disabled";
  if (input.healthy === true) return "Connected";
  if (input.healthy === false) return "Failed";
  return "Unknown";
}

export function toolQualifiedName(server: string, tool: string): string {
  if (tool.includes("__")) return tool;
  return `${server}__${tool}`;
}

export function enabledMcpCount(servers: InspectMcp[]): number {
  return servers.filter((s) => s.enabled !== false && s.compatibilityStatus !== "disabled").length;
}

export function parseInspect(raw: unknown): InspectReport {
  const o = asRecord(raw);
  const mcpRaw = Array.isArray(o.mcpServers) ? o.mcpServers : [];
  const mcpServers: InspectMcp[] = mcpRaw.map((item) => {
    if (typeof item === "string") return { name: item };
    const r = asRecord(item);
    const source = r.source;
    return {
      name: String(r.name ?? ""),
      transport: r.transport != null ? String(r.transport) : undefined,
      target: r.target != null ? String(r.target) : undefined,
      source:
        typeof source === "string" || (source && typeof source === "object")
          ? (source as InspectSource | string)
          : undefined,
      compatibilityStatus: r.compatibilityStatus != null ? String(r.compatibilityStatus) : undefined,
      vendor: r.vendor != null ? String(r.vendor) : undefined,
      enabled: typeof r.enabled === "boolean" ? r.enabled : undefined,
      scope: r.scope != null ? String(r.scope) : undefined,
      toolCount: typeof r.toolCount === "number" ? r.toolCount : undefined,
      tools: Array.isArray(r.tools) ? r.tools.map(String) : undefined,
    };
  });
  const skills: InspectSkill[] = (Array.isArray(o.skills) ? o.skills : []).map((item) => {
    const r = asRecord(item);
    return {
      name: String(r.name ?? ""),
      description: r.description != null ? String(r.description) : undefined,
      source: (r.source as InspectSource | string) ?? { type: "unknown" },
      userInvocable: typeof r.userInvocable === "boolean" ? r.userInvocable : undefined,
      disabled: typeof r.disabled === "boolean" ? r.disabled : undefined,
      qualifiedName: r.qualifiedName != null ? String(r.qualifiedName) : undefined,
    };
  });
  const plugins: InspectPlugin[] = (Array.isArray(o.plugins) ? o.plugins : []).map((item) => {
    const r = asRecord(item);
    const provides = asRecord(r.provides);
    return {
      name: String(r.name ?? ""),
      scope: r.scope != null ? String(r.scope) : undefined,
      path: r.path != null ? String(r.path) : undefined,
      enabled: typeof r.enabled === "boolean" ? r.enabled : undefined,
      trusted: typeof r.trusted === "boolean" ? r.trusted : undefined,
      provides: {
        skills: typeof provides.skills === "number" ? provides.skills : undefined,
        agents: typeof provides.agents === "number" ? provides.agents : undefined,
        hooks: typeof provides.hooks === "boolean" ? provides.hooks : undefined,
        mcpServers: typeof provides.mcpServers === "number" ? provides.mcpServers : undefined,
      },
    };
  });
  const hooks: InspectHook[] = (Array.isArray(o.hooks) ? o.hooks : []).map((item) => {
    const r = asRecord(item);
    return {
      event: String(r.event ?? ""),
      hookType: r.hookType != null ? String(r.hookType) : undefined,
      target: r.target != null ? String(r.target) : undefined,
      source: (r.source as InspectSource | string) ?? undefined,
      matcher: r.matcher == null ? null : String(r.matcher),
    };
  });
  const agents: InspectAgent[] = (Array.isArray(o.agents) ? o.agents : []).map((item) => {
    const r = asRecord(item);
    return {
      name: String(r.name ?? ""),
      description: r.description != null ? String(r.description) : undefined,
      source: (r.source as InspectSource | string) ?? undefined,
    };
  });
  const compat = asRecord(o.externalCompat);
  const cells = Array.isArray(compat.cells)
    ? compat.cells.map((c) => {
        const r = asRecord(c);
        return {
          vendor: String(r.vendor ?? ""),
          surface: String(r.surface ?? ""),
          enabled: r.enabled !== false,
          source: r.source != null ? String(r.source) : undefined,
        };
      })
    : undefined;
  return {
    grokVersion: o.grokVersion != null ? String(o.grokVersion) : undefined,
    cwd: o.cwd != null ? String(o.cwd) : undefined,
    projectRoot: o.projectRoot == null ? null : String(o.projectRoot),
    projectTrusted: typeof o.projectTrusted === "boolean" ? o.projectTrusted : undefined,
    skills,
    mcpServers,
    plugins,
    hooks,
    agents,
    marketplaces: Array.isArray(o.marketplaces) ? o.marketplaces : [],
    lspServers: Array.isArray(o.lspServers) ? o.lspServers : [],
    externalCompat: cells ? { cells } : undefined,
    permissions: o.permissions && typeof o.permissions === "object" ? asRecord(o.permissions) : undefined,
    projectInstructions: Array.isArray(o.projectInstructions) ? o.projectInstructions : undefined,
  };
}

export function emptyInspect(): InspectReport {
  return {
    skills: [],
    mcpServers: [],
    plugins: [],
    hooks: [],
    agents: [],
    marketplaces: [],
    lspServers: [],
  };
}
