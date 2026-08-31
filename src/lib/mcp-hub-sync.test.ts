import { describe, expect, it } from "vitest";
import type { McpServer } from "./agents-store";
import {
  grokMcpAddAfterCatalog,
  nextClaudeLiveText,
  nextKimiLiveText,
} from "./mcp-hub-sync";

const git: McpServer = {
  name: "git",
  transport: "stdio",
  commandOrUrl: "uvx",
  args: ["mcp-git"],
};
const docs: McpServer = { name: "docs", transport: "http", commandOrUrl: "https://example.com" };

describe("nextClaudeLiveText", () => {
  it("pretty-prints syncClaudeLive result with trailing newline", () => {
    const existing = JSON.stringify({ theme: "dark", mcpServers: { git: { command: "stale" } } }, null, 2);
    const text = nextClaudeLiveText(existing, [docs], ["git"]);
    expect(text.endsWith("\n")).toBe(true);
    expect(JSON.parse(text)).toEqual({
      theme: "dark",
      mcpServers: { docs: { type: "http", url: "https://example.com" } },
    });
  });

  it("treats empty, invalid, or non-object existing as {}", () => {
    for (const existing of ["", "not-json", "[]", "null", "42"]) {
      const text = nextClaudeLiveText(existing, [git], []);
      expect(JSON.parse(text)).toEqual({
        mcpServers: { git: { command: "uvx", args: ["mcp-git"] } },
      });
    }
  });
});

describe("nextKimiLiveText", () => {
  it("pretty-prints syncKimiLive servers with trailing newline", () => {
    const existing = JSON.stringify({ servers: [git, { name: "other", transport: "stdio", commandOrUrl: "x" }] });
    const text = nextKimiLiveText(existing, [docs], ["git"]);
    expect(text.endsWith("\n")).toBe(true);
    expect(JSON.parse(text)).toEqual({
      servers: [
        { name: "other", transport: "stdio", commandOrUrl: "x" },
        docs,
      ],
    });
  });

  it("treats invalid existing as empty doc", () => {
    const text = nextKimiLiveText("{bad", [git], []);
    expect(JSON.parse(text)).toEqual({ servers: [git] });
  });
});

describe("grokMcpAddAfterCatalog", () => {
  it("delegates to grokMcpWriteArgv", () => {
    expect(grokMcpAddAfterCatalog(git)).toEqual(["mcp", "add", "git", "--", "uvx", "mcp-git"]);
  });
});
