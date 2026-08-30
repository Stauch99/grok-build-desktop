import { describe, expect, it } from "vitest";
import type { McpServer } from "./agents-store";
import {
  mcpServerToClaude,
  mergeClaudeMcpDoc,
  mergeKimiMcpDoc,
  removeClaudeMcpServer,
  removeKimiMcpServer,
} from "./mcp-live";

const git: McpServer = {
  name: "git",
  transport: "stdio",
  commandOrUrl: "uvx",
  args: ["mcp-git"],
  env: ["TOKEN=abc", "NOPE", "=x", "OK=1=2"],
};
const docs: McpServer = { name: "docs", transport: "http", commandOrUrl: "https://example.com" };

describe("mcpServerToClaude", () => {
  it("maps stdio and http", () => {
    expect(mcpServerToClaude(git)).toEqual({
      command: "uvx",
      args: ["mcp-git"],
      env: { TOKEN: "abc", OK: "1=2" },
    });
    expect(mcpServerToClaude(docs)).toEqual({ type: "http", url: "https://example.com" });
    expect(mcpServerToClaude({ name: "x", transport: "sse", commandOrUrl: "https://sse" })).toEqual({
      type: "sse",
      url: "https://sse",
    });
    expect(mcpServerToClaude({ name: "bare", transport: "stdio" })).toEqual({});
  });
});

describe("mergeClaudeMcpDoc", () => {
  it("upserts mcpServers and keeps other keys", () => {
    const next = mergeClaudeMcpDoc({ theme: "dark", mcpServers: { old: { command: "a" } } }, [git]);
    expect(next.theme).toBe("dark");
    expect(next.mcpServers).toEqual({
      old: { command: "a" },
      git: { command: "uvx", args: ["mcp-git"], env: { TOKEN: "abc", OK: "1=2" } },
    });
  });
});

describe("removeClaudeMcpServer", () => {
  it("drops one name only", () => {
    expect(removeClaudeMcpServer({ mcpServers: { git: { command: "uvx" }, docs: { url: "u" } } }, "git")).toEqual({
      mcpServers: { docs: { url: "u" } },
    });
  });
});

describe("kimi mcp.json", () => {
  it("lets incoming win on name and can remove", () => {
    const existing = { servers: [{ name: "git", transport: "http", commandOrUrl: "https://old" }] };
    expect(mergeKimiMcpDoc(existing, [git, docs]).servers.map((s) => s.name)).toEqual(["git", "docs"]);
    expect(mergeKimiMcpDoc(existing, [git]).servers[0]).toEqual(git);
    expect(removeKimiMcpServer({ servers: [git, docs] }, "git").servers).toEqual([docs]);
  });
});
