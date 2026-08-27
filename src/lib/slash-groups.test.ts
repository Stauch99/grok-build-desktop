import { describe, expect, it } from "vitest";
import { SLASH_COMMANDS } from "./commands";
import { commandGroup, groupSlashCommands, hubTabForSlash } from "./slash-groups";

describe("slash groups", () => {
  it("marks builtins and qualified plugin skills", () => {
    expect(commandGroup({ name: "/compact", hint: "压缩" })).toBe("builtin");
    expect(commandGroup({ name: "/acme:login", hint: "login" })).toBe("plugin");
    expect(commandGroup({ name: "/review-pr", hint: "审 PR" })).toBe("skill");
  });

  it("groups a mixed list", () => {
    const groups = groupSlashCommands([
      { name: "/plan", hint: "", local: "plan" },
      { name: "/review", hint: "skill" },
      { name: "/acme:ship", hint: "plugin" },
    ]);
    expect(groups.map((g) => g.group)).toEqual(["builtin", "skill", "plugin"]);
  });

  it("routes hub slashes", () => {
    expect(hubTabForSlash("/skills")).toBe("skills");
    expect(hubTabForSlash("/mcps")).toBe("mcp");
    expect(hubTabForSlash("/plugins")).toBe("plugins");
    expect(hubTabForSlash("/marketplace")).toBe("marketplace");
    expect(hubTabForSlash("/hooks")).toBe("hooks");
    expect(hubTabForSlash("/compact")).toBeNull();
  });

  it("knows the shipped slash table", () => {
    expect(SLASH_COMMANDS.some((c) => c.name === "/skills")).toBe(true);
  });
});
