import { describe, expect, it } from "vitest";
import { looksLikePermissionRules, parsePermissionRules } from "./permission-toml";

describe("parsePermissionRules", () => {
  it("reads compact TOML arrays", () => {
    const text = `
[permission]
allow = ["Bash(git *)", "Read"]
deny = ["Bash(rm -rf *)"]
`;
    expect(parsePermissionRules(text)).toEqual({
      allow: ["Bash(git *)", "Read"],
      deny: ["Bash(rm -rf *)"],
    });
  });

  it("keeps ] inside quoted strings", () => {
    const text = `allow = ["Read(/tmp/[a-z])", "Grep"]`;
    expect(parsePermissionRules(text).allow).toEqual(["Read(/tmp/[a-z])", "Grep"]);
  });

  it("reads a single-string assignment", () => {
    expect(parsePermissionRules(`deny = "Bash(sudo *)"`)).toEqual({
      allow: [],
      deny: ["Bash(sudo *)"],
    });
  });

  it("reads structured action/tool/pattern tables", () => {
    const text = `
rules = [
  { action = "allow", tool = "bash", pattern = "git *" },
  { action = "deny", tool = "bash", pattern = "rm -rf *" },
  { action = "allow", tool = "read" },
]
`;
    expect(parsePermissionRules(text)).toEqual({
      allow: ["bash(git *)", "read"],
      deny: ["bash(rm -rf *)"],
    });
  });

  it("reads bare allow/deny lines", () => {
    const text = `
allow Bash(npm *)
deny Bash(sudo *)
# allow ignored
`;
    expect(parsePermissionRules(text)).toEqual({
      allow: ["Bash(npm *)"],
      deny: ["Bash(sudo *)"],
    });
  });

  it("reads JSON allow/deny arrays", () => {
    const text = `{ "allow": ["Read"], "deny": ["Edit(/etc/**)"] }`;
    expect(parsePermissionRules(text)).toEqual({
      allow: ["Read"],
      deny: ["Edit(/etc/**)"],
    });
  });

  it("is empty for unrelated text", () => {
    expect(parsePermissionRules("hello world")).toEqual({ allow: [], deny: [] });
    expect(looksLikePermissionRules("hello world")).toBe(false);
  });

  it("treats empty arrays as permission syntax", () => {
    expect(parsePermissionRules("allow = []\ndeny = []")).toEqual({ allow: [], deny: [] });
    expect(looksLikePermissionRules("allow = []")).toBe(true);
  });
});
