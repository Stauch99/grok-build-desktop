import { describe, expect, it } from "vitest";
import type { McpServer } from "./agents-store";
import {
  mcpServerToClaude,
  mergeClaudeMcpDoc,
  mergeCodexMcpTables,
  mergeKimiMcpDoc,
  mcpServerToCodex,
  parseClaudeMcpDoc,
  removeClaudeMcpServer,
  removeCodexMcpServer,
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

describe("codex mcp tables", () => {
  const codexGit: McpServer = {
    name: "git",
    transport: "stdio",
    commandOrUrl: "uvx",
    args: ["mcp-git"],
    env: ["TOKEN=abc"],
  };
  it("maps and upserts without deleting neighbors", () => {
    expect(mcpServerToCodex(codexGit)).toEqual({
      command: "uvx",
      args: ["mcp-git"],
      env: { TOKEN: "abc" },
    });
    expect(mcpServerToCodex({ name: "docs", transport: "http", commandOrUrl: "https://x" })).toEqual({
      url: "https://x",
    });
    const next = mergeCodexMcpTables({ old: { command: "a" } }, [codexGit]);
    expect(next.old).toEqual({ command: "a" });
    expect(next.git).toEqual({ command: "uvx", args: ["mcp-git"], env: { TOKEN: "abc" } });
    expect(removeCodexMcpServer(next, "git").git).toBeUndefined();
    expect(removeCodexMcpServer(next, "git").old).toEqual({ command: "a" });
  });
});

describe("parseClaudeMcpDoc", () => {
  it("imports mcpServers map into McpServer rows", () => {
    expect(
      parseClaudeMcpDoc({
        mcpServers: {
          git: { command: "uvx", args: ["mcp-git"] },
          docs: { type: "http", url: "https://x" },
        },
      }),
    ).toEqual([
      { name: "git", transport: "stdio", commandOrUrl: "uvx", args: ["mcp-git"] },
      { name: "docs", transport: "http", commandOrUrl: "https://x" },
    ]);
    expect(parseClaudeMcpDoc(null)).toEqual([]);
  });
});
