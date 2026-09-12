import { describe, expect, it } from "vitest";
import { liveMcpPath, removeMcpCatalog, upsertMcpCatalog } from "./mcp-live-paths";

describe("live MCP paths and catalog", () => {
  it("maps each CLI live file and upserts by name", () => {
    expect(liveMcpPath("/Users/me", "grok")).toBe("/Users/me/.grok/config.toml");
    expect(liveMcpPath("/Users/me/", "kimi")).toBe("/Users/me/.kimi-code/mcp.json");
    expect(liveMcpPath("/Users/me", "claude")).toBe("/Users/me/.claude.json");
    expect(liveMcpPath("/Users/me", "codex")).toBe("/Users/me/.codex/config.toml");
    const git = { name: "git", transport: "stdio" as const, commandOrUrl: "uvx" };
    expect(upsertMcpCatalog([{ name: "git", transport: "stdio", commandOrUrl: "old" }], git)).toEqual([git]);
    expect(removeMcpCatalog([git, { name: "docs", transport: "http", commandOrUrl: "https://x" }], "git")).toEqual([
      { name: "docs", transport: "http", commandOrUrl: "https://x" },
    ]);
  });
});
