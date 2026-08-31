import { describe, expect, it } from "vitest";
import {
  buildPaletteItems,
  clampIndex,
  filterPalette,
  paletteKey,
  parsePaletteAction,
  paletteSubmit,
  scoreItem,
  type PaletteItem,
} from "./palette";

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

describe("buildPaletteItems", () => {
  const session = {
    id: "s1",
    cwd: "/work/app",
    title: "Fix login",
    updatedAt: "",
    createdAt: "",
    numMessages: 1,
  };

  it("always leads with the core actions", () => {
    const items = buildPaletteItems({
      sessions: [],
      projects: [],
      commands: [],
      titles: {},
      cwd: "",
      isRepo: false,
    });
    expect(items[0]).toMatchObject({ id: "act:new-chat", group: "操作" });
    expect(items.some((i) => i.id === "act:worktree")).toBe(false);
    expect(items.some((i) => i.id === "act:finder")).toBe(false);
    expect(items.find((i) => i.id === "act:panel")).toMatchObject({
      label: "Dashboard",
      hint: "当前会话实时状态",
    });
    expect(items.find((i) => i.id === "act:dashboard")).toMatchObject({
      label: "会话总览",
      hint: "跨会话浏览",
    });
  });

  it("translates core actions for English", () => {
    const items = buildPaletteItems({
      sessions: [],
      projects: [],
      commands: [],
      titles: {},
      cwd: "",
      isRepo: false,
    }, "en");
    expect(items.find((i) => i.id === "act:new-chat")?.label).toBe("New chat");
    expect(items.find((i) => i.id === "act:dashboard")).toMatchObject({
      label: "Sessions",
      hint: "Browse across sessions",
    });
    expect(items.find((i) => i.id === "act:panel")).toMatchObject({
      label: "Dashboard",
      hint: "Live status for this session",
    });
  });

  it("adds worktree and finder when the workspace supports them", () => {
    const items = buildPaletteItems({
      sessions: [session],
      projects: ["/work/app"],
      commands: [{ name: "/plan", hint: "只做计划不改文件" }],
      titles: { s1: "登录修复" },
      cwd: "/work/app",
      isRepo: true,
    });
    expect(items.find((i) => i.id === "act:worktree")?.group).toBe("操作");
    expect(items.find((i) => i.id === "act:finder")?.group).toBe("操作");
    expect(items.find((i) => i.id === "session:s1")).toMatchObject({
      label: "登录修复",
      hint: "app",
      group: "会话",
    });
    expect(items.find((i) => i.id === "project:/work/app")).toMatchObject({
      group: "项目",
      hint: "/work/app",
    });
    expect(items.find((i) => i.id === "slash:/plan")).toMatchObject({
      group: "命令",
      hint: "只做计划不改文件",
    });
  });
});

describe("parsePaletteAction", () => {
  it("routes session, project, slash, and act ids", () => {
    expect(parsePaletteAction("session:s1")).toEqual({ kind: "session", id: "s1" });
    expect(parsePaletteAction("project:/work/app")).toEqual({ kind: "project", path: "/work/app" });
    expect(parsePaletteAction("slash:/plan")).toEqual({ kind: "slash", name: "/plan" });
    expect(parsePaletteAction("act:new-chat")).toEqual({ kind: "act", act: "new-chat" });
  });

  it("keeps windows drive letters in project paths", () => {
    expect(parsePaletteAction("project:C:\\work\\app")).toEqual({
      kind: "project",
      path: "C:\\work\\app",
    });
  });

  it("returns null for an unknown prefix", () => {
    expect(parsePaletteAction("nope:x")).toBeNull();
    expect(parsePaletteAction("")).toBeNull();
  });
});

const DAY = 86_400_000;

describe("filterPalette frecency", () => {
  it("ranks a used item above an unused peer before text score", () => {
    const items = [
      item({ id: "cold", label: "alpha" }),
      item({ id: "hot", label: "beta" }),
    ];
    const now = DAY;
    const out = filterPalette(items, "", 40, { hot: { uses: 4, lastAt: now } }, now);
    expect(out.map((i) => i.id)).toEqual(["hot", "cold"]);
  });

  it("breaks a text-score tie with frecency", () => {
    const items = [
      item({ id: "a", label: "plan a" }),
      item({ id: "b", label: "plan b" }),
    ];
    const now = 1_000;
    expect(filterPalette(items, "plan", 40, { b: { uses: 2, lastAt: now } }, now).map((i) => i.id)).toEqual(["b", "a"]);
  });
});

describe("paletteKey", () => {
  const state = { index: 1, hits: ITEMS, query: "x" };

  it("moves the highlight with arrows and wraps", () => {
    expect(paletteKey(state, "ArrowDown").index).toBe(2);
    expect(paletteKey({ ...state, index: ITEMS.length - 1 }, "ArrowDown").index).toBe(0);
    expect(paletteKey(state, "ArrowUp").index).toBe(0);
    expect(paletteKey({ ...state, index: 0 }, "ArrowUp").index).toBe(ITEMS.length - 1);
  });

  it("executes the highlighted hit on Enter", () => {
    expect(paletteKey(state, "Enter")).toMatchObject({ action: "pick", id: ITEMS[1].id, index: 1 });
  });

  it("searches on Enter when nothing is highlighted and the query is long enough", () => {
    expect(paletteKey({ index: 0, hits: [], query: "ab" }, "Enter")).toMatchObject({
      action: "search",
      search: "ab",
    });
  });

  it("closes on Escape", () => {
    expect(paletteKey(state, "Escape")).toMatchObject({ action: "close", index: 1 });
  });

  it("ignores other keys", () => {
    expect(paletteKey(state, "a")).toMatchObject({ action: "none", index: 1 });
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
