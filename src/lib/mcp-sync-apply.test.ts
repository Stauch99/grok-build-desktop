import { describe, expect, it } from "vitest";
import type { McpServer } from "./agents-store";
import {
  applyMcpToClaudeDoc,
  applyMcpToCodexTables,
  applyMcpToGrokTables,
  applyMcpToKimiDoc,
  syncClaudeLive,
  syncCodexLive,
  syncGrokLive,
  syncKimiLive,
} from "./mcp-sync-apply";

const git: McpServer = {
  name: "git",
  transport: "stdio",
  commandOrUrl: "uvx",
  args: ["mcp-git"],
  env: ["TOKEN=abc"],
};
const docs: McpServer = { name: "docs", transport: "http", commandOrUrl: "https://example.com" };

describe("syncClaudeLive", () => {
  it("merges enabled, removes disabled, keeps neighbors", () => {
    const doc = { theme: "dark", mcpServers: { old: { command: "a" }, git: { command: "stale" } } };
    const next = syncClaudeLive(doc, [docs], ["git"]);
    expect(next.theme).toBe("dark");
    expect(next.mcpServers).toEqual({
      old: { command: "a" },
      docs: { type: "http", url: "https://example.com" },
    });
  });
});

describe("syncKimiLive", () => {
  it("merges enabled, removes disabled, keeps neighbors", () => {
    const doc = { servers: [git, { name: "other", transport: "stdio", commandOrUrl: "x" }] };
    const next = syncKimiLive(doc, [docs], ["git"]);
    expect(next.servers.map((s) => s.name)).toEqual(["other", "docs"]);
    expect(next.servers.find((s) => s.name === "docs")).toEqual(docs);
  });
});

describe("syncCodexLive", () => {
  it("merges enabled, removes disabled, keeps neighbors", () => {
    const tables = { old: { command: "a" }, git: { command: "stale" } };
    const next = syncCodexLive(tables, [docs], ["git"]);
    expect(next.old).toEqual({ command: "a" });
    expect(next.git).toBeUndefined();
    expect(next.docs).toEqual({ url: "https://example.com" });
  });
});

describe("syncGrokLive", () => {
  it("merges enabled, removes disabled, keeps neighbors", () => {
    const tables = { old: { command: "a" }, git: { command: "stale" } };
    const next = syncGrokLive(tables, [docs], ["git"]);
    expect(next.old).toEqual({ command: "a" });
    expect(next.git).toBeUndefined();
    expect(next.docs).toEqual({ url: "https://example.com" });
  });
});

describe("applyMcpTo*Doc", () => {
  it("delegates merge for each live shape", () => {
    expect(applyMcpToClaudeDoc({ theme: "x" }, [git]).mcpServers).toEqual({
      git: { command: "uvx", args: ["mcp-git"], env: { TOKEN: "abc" } },
    });
    expect(applyMcpToKimiDoc({ servers: [] }, [git]).servers).toEqual([git]);
    expect(applyMcpToCodexTables({ old: { command: "a" } }, [git]).git).toEqual({
      command: "uvx",
      args: ["mcp-git"],
      env: { TOKEN: "abc" },
    });
    expect(applyMcpToGrokTables({ old: { command: "a" } }, [git]).git).toEqual({
      command: "uvx",
      args: ["mcp-git"],
      env: { TOKEN: "abc" },
    });
  });
});
