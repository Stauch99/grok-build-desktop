import { describe, expect, it } from "vitest";
import { mcpAddArgv, parseJsonList, parseJsonObject } from "./grok-cli";

describe("mcpAddArgv", () => {
  it("builds stdio add with env and --", () => {
    expect(
      mcpAddArgv({
        name: "postgres",
        transport: "stdio",
        commandOrUrl: "npx",
        args: ["-y", "@modelcontextprotocol/server-postgres"],
        env: ["DATABASE_URL=postgres://localhost/db"],
        scope: "user",
      }),
    ).toEqual([
      "mcp",
      "add",
      "--scope",
      "user",
      "-e",
      "DATABASE_URL=postgres://localhost/db",
      "postgres",
      "--",
      "npx",
      "-y",
      "@modelcontextprotocol/server-postgres",
    ]);
  });

  it("emits a single -- before the stdio command, with no later --flags", () => {
    const argv = mcpAddArgv({
      name: "x",
      transport: "stdio",
      commandOrUrl: "npx",
      args: ["-y", "@mcp/server"],
    });
    expect(argv.filter((token) => token === "--")).toHaveLength(1);
    const after = argv.slice(argv.indexOf("--") + 1);
    expect(after[0]).toBe("npx");
    expect(after.some((token) => token.startsWith("--"))).toBe(false);
  });

  it("builds http add with headers", () => {
    expect(
      mcpAddArgv({
        name: "api",
        transport: "http",
        commandOrUrl: "https://mcp.example.com/mcp",
        headers: ["Authorization: Bearer ${TOKEN}"],
        scope: "project",
      }),
    ).toEqual([
      "mcp",
      "add",
      "--transport",
      "http",
      "--scope",
      "project",
      "--header",
      "Authorization: Bearer ${TOKEN}",
      "api",
      "https://mcp.example.com/mcp",
    ]);
  });
});

describe("json helpers", () => {
  it("parses arrays and objects", () => {
    expect(parseJsonList('[{"name":"a"}]')).toEqual([{ name: "a" }]);
    expect(parseJsonObject('{"ok":true}')).toEqual({ ok: true });
    expect(parseJsonList("not-json")).toEqual([]);
  });
});
