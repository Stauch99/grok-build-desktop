import assert from "node:assert/strict";
import { describe, it } from "node:test";
import {
  displayTitle,
  filterProjectTree,
  modeLabel,
  nextMode,
  parseRenameArgs,
  partitionWorkspace,
  progressPresentation,
  setTitleOverride,
  slashForMode,
} from "./lib.js";

describe("displayTitle / setTitleOverride", () => {
  it("prefers override then generated title", () => {
    const s = { id: "a", title: "生成名" };
    assert.equal(displayTitle(s, {}), "生成名");
    assert.equal(displayTitle(s, { a: " 手改 " }), "手改");
  });
  it("clears override on empty", () => {
    const next = setTitleOverride({ a: "手改" }, "a", "  ");
    assert.deepEqual(next, {});
  });
});

describe("filterProjectTree", () => {
  const tree = [
    {
      path: "/p/desktop",
      name: "grok_build_desktop",
      sessions: [{ id: "s1", title: "流体对话列", cwd: "/p/desktop" }],
    },
    {
      path: "/p/beldore",
      name: "beldore",
      sessions: [{ id: "s2", title: "方案目录", cwd: "/p/beldore" }],
    },
  ];
  it("empty query is identity", () => {
    assert.equal(filterProjectTree(tree, "").length, 2);
  });
  it("matches override title", () => {
    const hit = filterProjectTree(tree, "原型", { s1: "桌面端交互原型" });
    assert.equal(hit.length, 1);
    assert.equal(hit[0].sessions[0].id, "s1");
  });
  it("matches project name and keeps its sessions", () => {
    const hit = filterProjectTree(tree, "beldore");
    assert.equal(hit.length, 1);
    assert.equal(hit[0].sessions.length, 1);
  });
});

describe("parseRenameArgs", () => {
  it("parses the four forms", () => {
    assert.deepEqual(parseRenameArgs(""), { kind: "edit" });
    assert.deepEqual(parseRenameArgs("--auto"), { kind: "auto" });
    assert.equal(parseRenameArgs("--auto x").kind, "error");
    assert.deepEqual(parseRenameArgs("桌面端"), { kind: "title", title: "桌面端" });
  });
});

describe("mode helpers", () => {
  it("labels never say Auto", () => {
    for (const mode of ["agent", "plan", "yolo"]) {
      assert.equal(/auto/i.test(modeLabel(mode)), false);
    }
  });
  it("maps slashes without a /yolo command", () => {
    assert.equal(slashForMode("agent"), "/auto");
    assert.equal(slashForMode("plan"), "/plan");
    assert.equal(slashForMode("yolo"), "/always-approve");
  });
  it("cycles Agent → Plan → 始终批准 → Agent", () => {
    assert.equal(nextMode("agent"), "plan");
    assert.equal(nextMode("plan"), "yolo");
    assert.equal(nextMode("yolo"), "agent");
  });
});

describe("progressPresentation / partitionWorkspace", () => {
  it("empty vs list are exclusive", () => {
    assert.deepEqual(progressPresentation([]), { kind: "empty" });
    assert.equal(progressPresentation([{ content: "x" }]).kind, "list");
  });
  it("splits dirs and files", () => {
    const { dirs, files } = partitionWorkspace([
      { name: "src", path: "/p/src", kind: "dir" },
      { name: "README.md", path: "/p/README.md", kind: "file" },
      { name: "package.json", path: "/p/package.json", kind: "file" },
    ]);
    assert.equal(dirs.length, 1);
    assert.equal(files.length, 2);
    assert.equal(files[0].name, "package.json");
  });
});
