import { describe, expect, it } from "vitest";
import { clampIndex, filterPalette, paletteSubmit, scoreItem, type PaletteItem } from "./palette";

const item = (over: Partial<PaletteItem> & { id: string; label: string }): PaletteItem => ({
  group: "会话",
  ...over,
});

const ITEMS: PaletteItem[] = [
  item({ id: "new", label: "新对话", group: "操作", hint: "开一个不绑目录的会话" }),
  item({ id: "s1", label: "Fix login bug" }),
  item({ id: "s2", label: "登录页重构" }),
  item({ id: "p1", label: "grok_build_desktop", group: "项目" }),
  item({ id: "c1", label: "/plan", group: "命令", hint: "只做计划不改文件" }),
];

describe("scoreItem", () => {
  it("scores everything equally with an empty query", () => {
    expect(scoreItem(ITEMS[0], "")).toBe(0);
    expect(scoreItem(ITEMS[1], "   ")).toBe(0);
  });

  it("ranks a prefix above a substring", () => {
    const prefix = scoreItem(item({ id: "a", label: "login page" }), "log");
    const substring = scoreItem(item({ id: "b", label: "fix login" }), "log");
    expect(prefix).not.toBeNull();
    expect(substring).not.toBeNull();
    expect(prefix!).toBeGreaterThan(substring!);
  });

  it("ranks a label match above a hint match", () => {
    const label = scoreItem(item({ id: "a", label: "plan things" }), "plan");
    const hint = scoreItem(item({ id: "b", label: "zzz", hint: "make a plan" }), "plan");
    expect(label!).toBeGreaterThan(hint!);
  });

  it("is case insensitive", () => {
    expect(scoreItem(item({ id: "a", label: "Fix Login" }), "fix login")).not.toBeNull();
  });

  it("matches chinese labels", () => {
    expect(scoreItem(item({ id: "a", label: "登录页重构" }), "登录")).not.toBeNull();
  });

  it("falls back to a subsequence match", () => {
    expect(scoreItem(item({ id: "a", label: "fix login bug" }), "flb")).toBe(100);
  });

  it("returns null when nothing matches", () => {
    expect(scoreItem(item({ id: "a", label: "abc" }), "xyz")).toBeNull();
  });
});

describe("filterPalette", () => {
  it("groups in a fixed order when there is no query", () => {
    const out = filterPalette(ITEMS, "");
    expect(out.map((i) => i.group)).toEqual(["操作", "会话", "会话", "项目", "命令"]);
  });

  it("drops non-matching items", () => {
    const out = filterPalette(ITEMS, "login");
    expect(out.map((i) => i.id)).toEqual(["s1"]);
  });

  it("respects the limit", () => {
    expect(filterPalette(ITEMS, "", 2)).toHaveLength(2);
  });

  it("finds chinese sessions", () => {
    expect(filterPalette(ITEMS, "登录").map((i) => i.id)).toEqual(["s2"]);
  });

  it("finds a slash command by hint", () => {
    expect(filterPalette(ITEMS, "只做计划").map((i) => i.id)).toEqual(["c1"]);
  });
});

describe("paletteSubmit", () => {
  it("picks the highlighted hit", () => {
    expect(paletteSubmit("x", ITEMS, 0)).toEqual({ kind: "pick", id: ITEMS[0].id });
  });

  it("searches when there is no hit and the query is long enough", () => {
    expect(paletteSubmit("ab", [], 0)).toEqual({ kind: "search", query: "ab" });
    expect(paletteSubmit("a", [], 0)).toEqual({ kind: "none" });
  });
});

describe("clampIndex", () => {
  it("wraps past the end", () => {
    expect(clampIndex(3, 3)).toBe(0);
  });

  it("wraps before the start", () => {
    expect(clampIndex(-1, 3)).toBe(2);
  });

  it("is zero for an empty list", () => {
    expect(clampIndex(2, 0)).toBe(0);
  });

  it("passes through a valid index", () => {
    expect(clampIndex(1, 3)).toBe(1);
  });
});
