import { describe, expect, it } from "vitest";
import {
  applyMentionPick,
  applyMentionPickIfCurrent,
  beginMentionPick,
  canAttachMentionContent,
  createMentionLifecycle,
  filterMentions,
  formatMentionWithContent,
  mentionMenuVisible,
  mentionPickIsCurrent,
  mentionRequestIsCurrent,
  resolveMentionReadPath,
} from "./mentions";

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

describe("mention file contents", () => {
  it("wraps text in a fenced block keyed by extension", () => {
    expect(formatMentionWithContent("src/a.ts", "hi")).toBe("@src/a.ts\n\n```ts\nhi\n```");
  });

  it("caps attached text at 100_000 characters", () => {
    const body = formatMentionWithContent("note.md", "x".repeat(100_001));
    expect(body).toContain("```md\n" + "x".repeat(100_000) + "\n```");
    expect(body.includes("x".repeat(100_001))).toBe(false);
  });

  it("only attaches contents for file and change hits", () => {
    expect(canAttachMentionContent({ id: "file:a.ts", label: "a.ts", insert: "@a.ts", group: "file" })).toBe(true);
    expect(canAttachMentionContent({ id: "change:a.ts", label: "a.ts", insert: "@a.ts", group: "change" })).toBe(true);
    expect(canAttachMentionContent({ id: "dir:src", label: "src/", insert: "@src/", group: "dir" })).toBe(false);
    expect(canAttachMentionContent({ id: "special:changes", label: "本次改动", insert: "@a.ts", group: "special" })).toBe(false);
  });

  it("replaces the @token with a fenced block when includeContent is on", () => {
    const hit = { id: "file:a.ts", label: "a.ts", insert: "@a.ts", group: "file" as const };
    expect(applyMentionPick({ value: "see @a", hit, includeContent: true, content: "export {}" })).toBe(
      "see @a.ts\n\n```ts\nexport {}\n``` ",
    );
    expect(applyMentionPick({ value: "see @a", hit, includeContent: false })).toBe("see @a.ts ");
  });

  it("joins a relative mention path onto the workspace cwd", () => {
    expect(resolveMentionReadPath("/work/app", "src/a.ts")).toBe("/work/app/src/a.ts");
    expect(resolveMentionReadPath("/work/app", "/abs/a.ts")).toBe("/abs/a.ts");
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

describe("mention pick race", () => {
  const hit = { id: "file:a.ts", label: "a.ts", insert: "@a.ts", group: "file" as const };

  it("closes the menu and advances generation before the file read", () => {
    expect(beginMentionPick({ generation: 4, value: "see @a" })).toEqual({
      generation: 5,
      value: "see @a",
      visible: false,
    });
  });

  it("applies the click-time snapshot only while that pick generation is current", () => {
    const pick = beginMentionPick({ generation: 0, value: "see @a" });

    expect(
      applyMentionPickIfCurrent({
        pick,
        currentGeneration: pick.generation,
        hit,
        includeContent: true,
        content: "export {}",
      }),
    ).toBe("see @a.ts\n\n```ts\nexport {}\n``` ");

    expect(
      applyMentionPickIfCurrent({
        pick,
        currentGeneration: pick.generation + 1,
        hit,
        includeContent: true,
        content: "stale",
      }),
    ).toBeNull();
  });

  it("lets a later pick invalidate an in-flight one", () => {
    const first = beginMentionPick({ generation: 0, value: "see @a" });
    const second = beginMentionPick({ generation: first.generation, value: "see @b" });

    expect(mentionPickIsCurrent({ pickGeneration: first.generation, currentGeneration: second.generation })).toBe(false);
    expect(mentionPickIsCurrent({ pickGeneration: second.generation, currentGeneration: second.generation })).toBe(true);
    expect(
      applyMentionPickIfCurrent({
        pick: first,
        currentGeneration: second.generation,
        hit,
        includeContent: false,
      }),
    ).toBeNull();
  });
});
