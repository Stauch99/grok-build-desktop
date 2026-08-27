import { describe, expect, it } from "vitest";
import { POPULAR_MCP, popularMcpAddArgs } from "./popular-mcp";

describe("popular MCP", () => {
  it("builds grok mcp add for filesystem", () => {
    const fs = POPULAR_MCP[0];
    expect(popularMcpAddArgs(fs, ["/tmp/proj"])).toEqual([
      "mcp",
      "add",
      "filesystem",
      "--",
      "npx",
      "-y",
      "@modelcontextprotocol/server-filesystem",
      "/tmp/proj",
    ]);
  });

  it("keeps http transport for sentry", () => {
    const sentry = POPULAR_MCP.find((p) => p.name === "sentry");
    expect(sentry).toBeTruthy();
    const args = popularMcpAddArgs(sentry!);
    expect(args[0]).toBe("mcp");
    expect(args).toContain("http");
    expect(args).toContain("sentry");
  });
});
