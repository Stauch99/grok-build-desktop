import { describe, expect, it } from "vitest";
import { loadOrInitMcpJson, type StoreFs } from "./agents-store-io";

function memStoreFs(): { fs: StoreFs; mem: Map<string, string> } {
  const mem = new Map<string, string>();
  const fs: StoreFs = {
    read: (p) => mem.get(p) ?? null,
    write: (p, t) => {
      mem.set(p, t);
    },
    exists: (p) => mem.has(p),
  };
  return { fs, mem };
}

describe("loadOrInitMcpJson", () => {
  it("unions live servers into empty store without dropping conflicts", () => {
    const { fs } = memStoreFs();
    const live = [
      { name: "git", transport: "stdio" as const, commandOrUrl: "uvx" },
      { name: "docs", transport: "http" as const, commandOrUrl: "https://x" },
    ];
    const first = loadOrInitMcpJson(fs, "/mcp.json", live);
    expect(first.catalog.map((s) => s.name).sort()).toEqual(["docs", "git"]);
    expect(first.conflicts).toEqual([]);
    const second = loadOrInitMcpJson(fs, "/mcp.json", [
      { name: "git", transport: "stdio", commandOrUrl: "npx" },
    ]);
    expect(second.conflicts).toEqual(["git"]);
    expect(second.catalog.find((s) => s.name === "git")?.commandOrUrl).toBe("uvx");
  });

  it("starts from empty catalog when file is missing or invalid", () => {
    const { fs } = memStoreFs();
    const live = [{ name: "git", transport: "stdio" as const, commandOrUrl: "uvx" }];
    const missing = loadOrInitMcpJson(fs, "/mcp.json", live);
    expect(missing.catalog).toEqual(live);
    expect(fs.exists("/mcp.json")).toBe(true);

    fs.write("/mcp.json", "not json");
    const invalid = loadOrInitMcpJson(fs, "/mcp.json", live);
    expect(invalid.catalog).toEqual(live);
    expect(fs.exists("/mcp.json")).toBe(true);
  });
});
