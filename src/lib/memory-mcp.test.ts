import { describe, expect, it } from "vitest";
import { MEMORY_MCP_NAME, isMemoryMcpName, memoryMcpServer, memoryMcpSnippet } from "./memory-mcp";

describe("memory MCP catalog helpers", () => {
  it("pins the builtin name and emits a stdio snippet", () => {
    expect(isMemoryMcpName(MEMORY_MCP_NAME)).toBe(true);
    expect(isMemoryMcpName("other")).toBe(false);
    expect(memoryMcpServer("/opt/memory-mcp")).toEqual({
      name: MEMORY_MCP_NAME,
      transport: "stdio",
      commandOrUrl: "/opt/memory-mcp",
    });
    expect(memoryMcpSnippet("/opt/memory-mcp")).toContain('"/opt/memory-mcp"');
  });
});
