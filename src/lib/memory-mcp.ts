import type { McpServer } from "./agents-store";

export const MEMORY_MCP_NAME = "grok-build-memory";

export function isMemoryMcpName(name: string): boolean {
  return name === MEMORY_MCP_NAME;
}

export function memoryMcpServer(binPath: string): McpServer {
  return {
    name: MEMORY_MCP_NAME,
    transport: "stdio",
    commandOrUrl: binPath,
  };
}

/** Generic stdio snippet for any MCP client. */
export function memoryMcpSnippet(binPath: string): string {
  return `{
  "mcpServers": {
    "${MEMORY_MCP_NAME}": {
      "command": ${JSON.stringify(binPath)}
    }
  }
}
`;
}
