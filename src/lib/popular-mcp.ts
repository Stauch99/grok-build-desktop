export type PopularMcp = {
  name: string;
  label: string;
  hint: string;
  transport: "stdio" | "http" | "sse";
  /** Arguments after `grok mcp add <name>`. */
  args: string[];
};

/** One-click presets. Each still shells out to `grok mcp add`. */
export const POPULAR_MCP: PopularMcp[] = [
  {
    name: "filesystem",
    label: "Filesystem",
    hint: "本地目录读写",
    transport: "stdio",
    args: ["--", "npx", "-y", "@modelcontextprotocol/server-filesystem"],
  },
  {
    name: "github",
    label: "GitHub",
    hint: "Issues / PR / 代码搜索",
    transport: "stdio",
    args: ["--", "npx", "-y", "@modelcontextprotocol/server-github"],
  },
  {
    name: "sentry",
    label: "Sentry",
    hint: "远程 HTTP + OAuth",
    transport: "http",
    args: ["--transport", "http", "https://mcp.sentry.dev/mcp"],
  },
];

export function popularMcpAddArgs(preset: PopularMcp, extra: string[] = []): string[] {
  if (preset.transport === "stdio") {
    return ["mcp", "add", preset.name, ...preset.args, ...extra];
  }
  return ["mcp", "add", "--transport", preset.transport, preset.name, ...preset.args.filter((a) => a !== "--transport" && a !== preset.transport), ...extra];
}
