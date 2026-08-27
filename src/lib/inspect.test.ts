import { describe, expect, it } from "vitest";
import {
  enabledMcpCount,
  groupSkills,
  isUserGrokConfig,
  mcpHealthLabel,
  mcpSourceBadge,
  parseInspect,
  qualifySkillName,
  skillScope,
  toolQualifiedName,
} from "./inspect";

const inspectSample = {
  grokVersion: "1.0.4",
  projectTrusted: true,
  skills: [
    {
      name: "login",
      description: "user login",
      source: { type: "user", path: "/Users/me/.grok/skills/login/SKILL.md" },
      userInvocable: true,
    },
    {
      name: "login",
      description: "plugin login",
      source: { type: "plugin", plugin_name: "acme", path: "/p/acme/skills/login/SKILL.md" },
      userInvocable: true,
    },
    {
      name: "review",
      source: { type: "local", path: "/work/app/.grok/skills/review/SKILL.md" },
    },
  ],
  mcpServers: [
    {
      name: "fs",
      transport: "stdio",
      source: { type: "configToml", path: "/Users/me/.grok/config.toml" },
    },
    {
      name: "paper",
      transport: "http",
      source: { type: "claudeJson", path: "/Users/me/.claude.json" },
      vendor: "claude",
      enabled: false,
    },
    "legacy-name",
  ],
  plugins: [{ name: "codex", enabled: true, provides: { skills: 3, hooks: true, mcpServers: 0 } }],
  hooks: [{ event: "PreToolUse", hookType: "command", source: { type: "user", path: "/Users/me/.grok/hooks" } }],
  agents: [{ name: "explore", source: { type: "builtin" } }],
  marketplaces: [],
  lspServers: [],
  externalCompat: {
    cells: [{ vendor: "claude", surface: "skills", enabled: true, source: "config" }],
  },
};

describe("parseInspect", () => {
  it("keeps skills, plugins, hooks, and full MCP objects", () => {
    const report = parseInspect(inspectSample);
    expect(report.grokVersion).toBe("1.0.4");
    expect(report.projectTrusted).toBe(true);
    expect(report.skills).toHaveLength(3);
    expect(report.mcpServers[0]?.name).toBe("fs");
    expect(report.mcpServers[2]?.name).toBe("legacy-name");
    expect(report.plugins[0]?.provides?.skills).toBe(3);
    expect(report.hooks[0]?.event).toBe("PreToolUse");
    expect(report.externalCompat?.cells?.[0]?.vendor).toBe("claude");
  });
});

describe("skill grouping and collisions", () => {
  it("groups by discovery scope", () => {
    const report = parseInspect(inspectSample);
    const groups = groupSkills(report.skills, "/work/app");
    expect(groups.map((g) => g.scope)).toEqual(["cwd", "user", "plugin"]);
  });

  it("qualifies colliding names", () => {
    const report = parseInspect(inspectSample);
    const user = report.skills[0];
    const plugin = report.skills[1];
    expect(qualifySkillName(user, report.skills)).toBe("user:login");
    expect(qualifySkillName(plugin, report.skills)).toBe("acme:login");
    expect(qualifySkillName(report.skills[2], report.skills)).toBe("review");
  });

  it("treats claude/cursor paths as compat", () => {
    expect(
      skillScope({
        name: "x",
        source: { type: "user", path: "/Users/me/.claude/skills/x/SKILL.md" },
      }),
    ).toBe("compat");
  });
});

describe("mcp badges and health", () => {
  it("badges toml / claude / mcp.json", () => {
    const report = parseInspect(inspectSample);
    expect(mcpSourceBadge(report.mcpServers[0])).toBe("toml");
    expect(mcpSourceBadge(report.mcpServers[1])).toBe("claude");
    expect(
      mcpSourceBadge({
        name: "cursor-fs",
        source: { type: "mcpJson", path: "/Users/me/.cursor/mcp.json" },
      }),
    ).toBe("mcp.json");
  });

  it("classifies user vs project grok config", () => {
    expect(isUserGrokConfig("/Users/me/.grok/config.toml")).toBe(true);
    expect(isUserGrokConfig("/work/app/.grok/config.toml")).toBe(false);
  });

  it("maps doctor health", () => {
    expect(mcpHealthLabel({ enabled: false })).toBe("Disabled");
    expect(mcpHealthLabel({ healthy: true })).toBe("Connected");
    expect(mcpHealthLabel({ healthy: false })).toBe("Failed");
    expect(enabledMcpCount(parseInspect(inspectSample).mcpServers)).toBe(2);
  });

  it("namespaces tools as server__tool", () => {
    expect(toolQualifiedName("github", "create_issue")).toBe("github__create_issue");
    expect(toolQualifiedName("github", "github__create_issue")).toBe("github__create_issue");
  });
});
