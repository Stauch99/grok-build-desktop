import { describe, expect, it } from "vitest";
import { filterCommands, parseRenameArgs, SLASH_COMMANDS } from "./commands";

describe("filterCommands", () => {
  it("matches compact", () => {
    const hits = filterCommands("comp");
    expect(hits.some((c) => c.name === "/compact")).toBe(true);
  });
  it("merges extra agent commands", () => {
    const hits = filterCommands("foo", [{ name: "foobar", hint: "x" }]);
    expect(hits[0].name).toBe("/foobar");
  });

  it("routes hub slashes locally", () => {
    const skills = filterCommands("skills").find((c) => c.name === "/skills");
    expect(skills?.local).toBe("hub");
    expect(skills?.hubTab).toBe("skills");
    expect(filterCommands("mcps").some((c) => c.name === "/mcps" && c.hubTab === "mcp")).toBe(true);
  });

  it("keeps CLI-only workflow commands out of the static desktop list", () => {
    const names = SLASH_COMMANDS.map((command) => command.name);
    expect(names).not.toContain("/bridge");
    expect(names).not.toContain("/loop");
    expect(names).not.toContain("/goal");
    expect(names).not.toContain("/workflows");
  });

  it("still accepts runtime-provided commands omitted from the static list", () => {
    const hits = filterCommands("bridge", [{ name: "bridge", hint: "CLI runtime command" }]);
    expect(hits.some((command) => command.name === "/bridge")).toBe(true);
  });

  it("keeps direct conversation and local desktop actions", () => {
    const names = SLASH_COMMANDS.map((command) => command.name);
    expect(names).toEqual(expect.arrayContaining([
      "/compact",
      "/context",
      "/remember",
      "/flush",
      "/dream",
      "/dashboard",
      "/imagine",
      "/imagine-video",
      "/config-agents",
    ]));
  });

  it("aliases /plugins to the skills hub tab", () => {
    const plugins = SLASH_COMMANDS.find((c) => c.name === "/plugins");
    expect(plugins?.local).toBe("hub");
    expect(plugins?.hubTab).toBe("skills");
  });

  it("runs /dream on the desktop", () => {
    const dream = SLASH_COMMANDS.find((c) => c.name === "/dream");
    expect(dream?.local).toBe("dream");
  });
});

describe("parseRenameArgs", () => {
  it("parses the four forms", () => {
    expect(parseRenameArgs("")).toEqual({ kind: "edit" });
    expect(parseRenameArgs("--auto")).toEqual({ kind: "auto" });
    expect(parseRenameArgs("--auto x").kind).toBe("error");
    expect(parseRenameArgs("桌面端")).toEqual({ kind: "title", title: "桌面端" });
  });
});
