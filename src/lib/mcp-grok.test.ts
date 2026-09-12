import { describe, expect, it } from "vitest";
import { grokMcpWriteArgv, mergeGrokMcpTables, mcpServerToGrokToml } from "./mcp-grok";

describe("grok MCP write", () => {
  it("prefers grok mcp add argv and can merge a toml table", () => {
    expect(
      grokMcpWriteArgv({ name: "git", transport: "stdio", commandOrUrl: "uvx", args: ["mcp-git"] }),
    ).toEqual(["mcp", "add", "git", "--", "uvx", "mcp-git"]);
    expect(mcpServerToGrokToml({ name: "docs", transport: "http", commandOrUrl: "https://x" })).toEqual({
      url: "https://x",
    });
    const next = mergeGrokMcpTables({ old: { command: "a" } }, [
      { name: "git", transport: "stdio", commandOrUrl: "uvx" },
    ]);
    expect(next.old).toEqual({ command: "a" });
    expect(next.git).toEqual({ command: "uvx" });
  });
});
