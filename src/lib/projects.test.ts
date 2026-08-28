import { describe, expect, it } from "vitest";
import {
  displayTitle,
  filterProjectTree,
  groupSessions,
  mergeProjectPaths,
  countDescendants,
  nestByParent,
  setTitleOverride,
} from "./projects";

describe("mergeProjectPaths", () => {
  it("dedupes paths", () => {
    const merged = mergeProjectPaths(["/b/proj", "/a/app"], ["/a/app", "/c/x"]);
    expect(new Set(merged).size).toBe(3);
    expect(merged).toContain("/a/app");
    expect(merged).toContain("/b/proj");
    expect(merged).toContain("/c/x");
  });
});

describe("groupSessions", () => {
  it("nests sessions under matching project cwd", () => {
    const nodes = groupSessions(
      ["/work/a", "/work/b"],
      [
        { id: "1", cwd: "/work/a", title: "one", updatedAt: "2", createdAt: "", numMessages: 1 },
        { id: "2", cwd: "/work/b", title: "two", updatedAt: "1", createdAt: "", numMessages: 1 },
        { id: "3", cwd: "/work/a", title: "three", updatedAt: "3", createdAt: "", numMessages: 4 },
      ],
    );
    expect(nodes[0].sessions.map((s) => s.id)).toEqual(["3", "1"]);
    expect(nodes[1].sessions).toHaveLength(1);
  });
});

describe("displayTitle / setTitleOverride", () => {
  it("prefers override then generated title", () => {
    const s = { id: "a", title: "生成名" };
    expect(displayTitle(s, {})).toBe("生成名");
    expect(displayTitle(s, { a: " 手改 " })).toBe("手改");
    expect(displayTitle({ id: "x", title: "" }, {})).toBe("未命名会话");
  });
  it("falls back to first 40 chars of preview when title is empty", () => {
    const long = "这是一段很长的首条用户消息用来做会话预览标题超过四十个字就会被截断";
    expect(displayTitle({ id: "s1", title: "" }, {}, { s1: long })).toBe(long.slice(0, 40));
    expect(displayTitle({ id: "s1", title: "  " }, {}, { s1: "  简短预览  " })).toBe("简短预览");
  });
  it("does not use preview when override or generated title exists", () => {
    expect(displayTitle({ id: "s1", title: "生成名" }, {}, { s1: "预览" })).toBe("生成名");
    expect(displayTitle({ id: "s1", title: "" }, { s1: "手改" }, { s1: "预览" })).toBe("手改");
  });
  it("falls back to 未命名会话 when preview is missing or blank", () => {
    expect(displayTitle({ id: "s1", title: "" }, {}, { s1: "   " })).toBe("未命名会话");
    expect(displayTitle({ id: "s1", title: "" }, {}, {})).toBe("未命名会话");
  });
  it("clears override on empty", () => {
    expect(setTitleOverride({ a: "手改" }, "a", "  ")).toEqual({});
  });
  it("caps at 80 chars", () => {
    const next = setTitleOverride({}, "a", "字".repeat(90));
    expect(next.a).toHaveLength(80);
  });
});

describe("nestByParent", () => {
  const s = (
    id: string,
    parentSessionId?: string,
    updatedAt = id,
  ): { id: string; cwd: string; title: string; updatedAt: string; createdAt: string; numMessages: number; parentSessionId?: string } => ({
    id,
    cwd: "/p",
    title: id,
    updatedAt,
    createdAt: "",
    numMessages: 1,
    parentSessionId,
  });

  it("nests subagent sessions under the parent", () => {
    const tree = nestByParent([
      s("parent", undefined, "3"),
      s("a", "parent", "2"),
      s("b", "parent", "1"),
    ]);
    expect(tree.map((n) => n.session.id)).toEqual(["parent"]);
    expect(tree[0].children.map((n) => n.session.id)).toEqual(["a", "b"]);
  });

  it("keeps orphans whose parent is missing", () => {
    const tree = nestByParent([s("ghost", "gone", "9"), s("root", undefined, "1")]);
    expect(tree.map((n) => n.session.id)).toEqual(["ghost", "root"]);
  });

  it("nests more than one level", () => {
    const tree = nestByParent([s("p"), s("c", "p"), s("gc", "c")]);
    expect(tree[0].children[0].children[0].session.id).toBe("gc");
  });
  it("counts descendants", () => {
    const tree = nestByParent([s("p"), s("c", "p"), s("gc", "c"), s("c2", "p")]);
    expect(countDescendants(tree[0])).toBe(3);
  });
});

describe("filterProjectTree", () => {
  const tree = [
    {
      path: "/p/desktop",
      name: "grok_build_desktop",
      sessions: [{ id: "s1", cwd: "/p/desktop", title: "流体对话列", updatedAt: "", createdAt: "", numMessages: 1 }],
    },
    {
      path: "/p/beldore",
      name: "beldore",
      sessions: [{ id: "s2", cwd: "/p/beldore", title: "方案目录", updatedAt: "", createdAt: "", numMessages: 1 }],
    },
  ];
  it("empty query is identity", () => {
    expect(filterProjectTree(tree, "")).toHaveLength(2);
  });
  it("matches override title", () => {
    const hit = filterProjectTree(tree, "原型", { s1: "桌面端交互原型" });
    expect(hit).toHaveLength(1);
    expect(hit[0].sessions[0].id).toBe("s1");
  });
  it("matches project name and keeps its sessions", () => {
    const hit = filterProjectTree(tree, "beldore");
    expect(hit).toHaveLength(1);
    expect(hit[0].sessions).toHaveLength(1);
  });
});
