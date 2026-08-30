import { describe, expect, it } from "vitest";
import {
  defaultWorkbenchHome,
  grokWebuiPath,
  migrateSessionKeyMap,
  migrateWebuiSessionMaps,
  shouldMigrateWebui,
  workbenchJsonPath,
} from "./workbench-home";

describe("workbench paths", () => {
  it("lives under ~/.acp-workbench", () => {
    expect(defaultWorkbenchHome("/Users/me/")).toBe("/Users/me/.acp-workbench");
    expect(workbenchJsonPath("/Users/me/.acp-workbench")).toBe("/Users/me/.acp-workbench/workbench.json");
    expect(grokWebuiPath("/Users/me/.grok")).toBe("/Users/me/.grok/webui.json");
  });

  it("migrates only when workbench is missing", () => {
    expect(shouldMigrateWebui(false, true)).toBe(true);
    expect(shouldMigrateWebui(true, true)).toBe(false);
    expect(shouldMigrateWebui(false, false)).toBe(false);
  });
});

describe("migrateSessionKeyMap", () => {
  it("prefixes bare ids as grok and keeps branded keys", () => {
    expect(migrateSessionKeyMap({ abc: 1, "claude/x": 2, "": 3 })).toEqual({
      "grok/abc": 1,
      "claude/x": 2,
    });
  });
});

describe("migrateWebuiSessionMaps", () => {
  it("rewrites pinned and titles", () => {
    const next = migrateWebuiSessionMaps({ pinned: { s1: true }, titles: { s1: "Hi" } });
    expect(next.pinned).toEqual({ "grok/s1": true });
    expect(next.titles).toEqual({ "grok/s1": "Hi" });
  });
});
