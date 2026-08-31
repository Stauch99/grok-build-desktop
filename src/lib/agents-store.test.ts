import { describe, expect, it } from "vitest";
import {
  defaultAgentsHome,
  defaultSyncFlags,
  mcpJsonPath,
  mcpServersForAgent,
  mergeMcpCatalog,
  parseMcpJson,
  parseSyncJson,
  skillDir,
  skillMarkdown,
  skillNameOk,
  stringifyMcpJson,
  stringifySyncJson,
  syncJsonPath,
  type McpServer,
} from "./agents-store";

describe("agents-store paths", () => {
  it("places skills and mcp under ~/.agents", () => {
    const root = defaultAgentsHome("/Users/me");
    expect(root).toBe("/Users/me/.agents");
    expect(skillDir(root, "pdf")).toBe("/Users/me/.agents/skills/pdf");
    expect(mcpJsonPath(root)).toBe("/Users/me/.agents/mcp.json");
    expect(syncJsonPath(root)).toBe("/Users/me/.agents/sync.json");
  });
});

describe("skillNameOk", () => {
  it("matches grok skill names", () => {
    expect(skillNameOk("pdf-review")).toBe(true);
    expect(skillNameOk("a")).toBe(true);
    expect(skillNameOk("Pdf")).toBe(false);
    expect(skillNameOk("")).toBe(false);
    expect(skillNameOk("-x")).toBe(false);
    expect(skillNameOk("x_y")).toBe(false);
  });
});

describe("mcp catalog", () => {
  const stdio: McpServer = { name: "git", transport: "stdio", commandOrUrl: "uvx", args: ["mcp-git"] };
  const http: McpServer = { name: "docs", transport: "http", commandOrUrl: "https://example.com" };

  it("lets canonical win on name conflict and unions the rest", () => {
    const imported: McpServer = { name: "git", transport: "http", commandOrUrl: "https://other" };
    expect(mergeMcpCatalog([stdio], [imported, http])).toEqual([stdio, http]);
  });

  it("defaults a missing sync flag to enabled", () => {
    const catalog = [stdio, http];
    const sync = { skills: {}, mcp: { git: { grok: true, kimi: false, claude: true, codex: true } } };
    expect(mcpServersForAgent(catalog, sync, "kimi").map((s) => s.name)).toEqual(["docs"]);
    expect(mcpServersForAgent(catalog, sync, "grok").map((s) => s.name)).toEqual(["git", "docs"]);
  });

  it("parses { servers: [] }", () => {
    expect(parseMcpJson({ servers: [stdio] })).toEqual([stdio]);
    expect(parseMcpJson(null)).toEqual([]);
    expect(parseMcpJson({ servers: [{ name: "" }] })).toEqual([]);
  });
});

describe("defaultSyncFlags", () => {
  it("enables every AgentId", () => {
    expect(defaultSyncFlags()).toEqual({ grok: true, kimi: true, claude: true, codex: true });
  });
});

describe("skillMarkdown", () => {
  it("writes the canonical SKILL.md front matter", () => {
    expect(skillMarkdown("pdf-review", "Extract tables from PDFs")).toBe(
      `---
name: pdf-review
description: Extract tables from PDFs
user-invocable: true
---

# pdf-review
`,
    );
  });
});

describe("stringify catalog files", () => {
  it("pretty-prints mcp.json and sync.json with a trailing newline", () => {
    const servers = [{ name: "git", transport: "stdio" as const, commandOrUrl: "uvx" }];
    expect(stringifyMcpJson(servers)).toBe(`${JSON.stringify({ servers }, null, 2)}\n`);
    const sync = {
      skills: { pdf: { grok: true, kimi: false, claude: true, codex: true } },
      mcp: {},
    };
    expect(stringifySyncJson(sync)).toBe(`${JSON.stringify(sync, null, 2)}\n`);
  });
});

describe("parseSyncJson", () => {
  it("returns empty maps for junk", () => {
    expect(parseSyncJson(null)).toEqual({ skills: {}, mcp: {} });
    expect(parseSyncJson([])).toEqual({ skills: {}, mcp: {} });
    expect(parseSyncJson({ skills: [], mcp: "x" })).toEqual({ skills: {}, mcp: {} });
  });

  it("keeps only boolean AgentId flags", () => {
    expect(
      parseSyncJson({
        skills: { pdf: { grok: true, kimi: 1, claude: false, extra: true } },
        mcp: { git: { grok: true } },
      }),
    ).toEqual({
      skills: { pdf: { grok: true, kimi: false, claude: false, codex: false } },
      mcp: { git: { grok: true, kimi: false, claude: false, codex: false } },
    });
  });
});
