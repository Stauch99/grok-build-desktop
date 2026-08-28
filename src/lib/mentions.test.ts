import { describe, expect, it } from "vitest";
import { createMentionLifecycle, filterMentions, mentionMenuVisible, mentionRequestIsCurrent } from "./mentions";

describe("filterMentions", () => {
  it("expands 本次改动 into one @path per change", () => {
    const hits = filterMentions({
      query: "本次",
      files: ["src/a.ts"],
      changes: ["src/a.ts", "src/b.ts"],
    });
    expect(hits[0]).toMatchObject({
      group: "special",
      insert: "@src/a.ts @src/b.ts",
    });
  });

  it("lists matching folders before files", () => {
    const hits = filterMentions({
      query: "src",
      files: ["src/App.tsx", "README.md"],
      dirs: ["src", "src/lib"],
    });
    expect(hits.map((h) => h.group)).toEqual(["dir", "dir", "file"]);
    expect(hits[0].insert).toBe("@src/");
  });

  it("returns an empty list when nothing matches", () => {
    expect(filterMentions({ query: "zzz", files: ["a.ts"] })).toEqual([]);
  });

  it("caps the list at twelve", () => {
    const files = Array.from({ length: 20 }, (_, i) => `f${i}.ts`);
    expect(filterMentions({ query: "", files })).toHaveLength(12);
  });
});

describe("mention request identity", () => {
  it("accepts only the latest visible query generation", () => {
    expect(mentionRequestIsCurrent({ requestGeneration: 3, currentGeneration: 3, requestQuery: "app", currentQuery: "app", visible: true, requestOwner: "/a", currentOwner: "/a" })).toBe(true);
    expect(mentionRequestIsCurrent({ requestGeneration: 2, currentGeneration: 3, requestQuery: "a", currentQuery: "app", visible: true, requestOwner: "/a", currentOwner: "/a" })).toBe(false);
    expect(mentionRequestIsCurrent({ requestGeneration: 3, currentGeneration: 3, requestQuery: "app", currentQuery: "app", visible: false, requestOwner: "/a", currentOwner: "/a" })).toBe(false);
    expect(mentionRequestIsCurrent({ requestGeneration: 3, currentGeneration: 3, requestQuery: "app", currentQuery: "app", visible: true, requestOwner: "/a", currentOwner: "/b" })).toBe(false);
  });

  it("invalidates a pending request when its owner changes", () => {
    const lifecycle = createMentionLifecycle("/workspace-a");
    const request = lifecycle.begin("app");

    lifecycle.changeOwner("/workspace-b");

    expect(lifecycle.isCurrent(request)).toBe(false);
    expect(lifecycle.snapshot()).toEqual({
      owner: "/workspace-b",
      generation: 2,
      query: "",
      visible: false,
    });
  });
});

describe("mentionMenuVisible", () => {
  it("opens on a trailing @ token without a newline", () => {
    expect(mentionMenuVisible("@src")).toBe(true);
    expect(mentionMenuVisible("see @App")).toBe(true);
    expect(mentionMenuVisible("hello\n@file")).toBe(true);
  });

  it("stays closed for slash input, missing @, or a newline after @", () => {
    expect(mentionMenuVisible("")).toBe(false);
    expect(mentionMenuVisible("hello")).toBe(false);
    expect(mentionMenuVisible("/compact")).toBe(false);
    expect(mentionMenuVisible("/foo @bar")).toBe(false);
    expect(mentionMenuVisible("@src\nmore")).toBe(false);
  });
});
