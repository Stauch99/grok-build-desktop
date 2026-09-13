import { describe, expect, it } from "vitest";
import {
  EMPTY_PROJECT_GROUPS,
  assignProjectToGroup,
  createProjectGroup,
  deleteProjectGroup,
  groupIdFor,
  loadProjectGroups,
  loadProjectOrder,
  nextGroupName,
  orderProjectPaths,
  orderProjectSections,
  pruneProjectGroups,
  renameProjectGroup,
  reorderProjectOrder,
  ungroupProject,
} from "./project-groups";

describe("nextGroupName", () => {
  it("starts at 新分组 and increments", () => {
    expect(nextGroupName([])).toBe("新分组");
    expect(nextGroupName(["工作"])).toBe("新分组");
    expect(nextGroupName(["新分组"])).toBe("新分组 2");
    expect(nextGroupName(["新分组", "新分组 2"])).toBe("新分组 3");
  });
});

describe("create and assign", () => {
  it("creates a named group and assigns a project exclusively", () => {
    const made = createProjectGroup(EMPTY_PROJECT_GROUPS, "工作", "g1");
    expect(made.state.groups).toEqual([{ id: "g1", name: "工作" }]);
    const assigned = assignProjectToGroup(made.state, "/work/app", "g1");
    expect(groupIdFor(assigned, "/work/app/")).toBe("g1");

    const personal = createProjectGroup(assigned, "个人", "g2");
    const moved = assignProjectToGroup(personal.state, "/work/app", "g2");
    expect(groupIdFor(moved, "/work/app")).toBe("g2");
    expect(Object.keys(moved.membership)).toEqual(["/work/app"]);
  });

  it("ignores assign to a missing group", () => {
    expect(assignProjectToGroup(EMPTY_PROJECT_GROUPS, "/work/app", "nope")).toEqual(EMPTY_PROJECT_GROUPS);
  });

  it("ungroups and deleteGroup returns members to ungrouped", () => {
    let state = createProjectGroup(EMPTY_PROJECT_GROUPS, "工作", "g1").state;
    state = assignProjectToGroup(state, "/a", "g1");
    state = assignProjectToGroup(state, "/b", "g1");
    expect(ungroupProject(state, "/a").membership).toEqual({ "/b": "g1" });
    expect(deleteProjectGroup(state, "g1")).toEqual(EMPTY_PROJECT_GROUPS);
  });

  it("renames in place", () => {
    const made = createProjectGroup(EMPTY_PROJECT_GROUPS, "工作", "g1");
    expect(renameProjectGroup(made.state, "g1", " 办公 ").groups[0]?.name).toBe("办公");
    expect(renameProjectGroup(made.state, "g1", "   ")).toEqual(made.state);
  });
});

describe("pruneProjectGroups", () => {
  it("drops membership for folders that left the library and stale group ids", () => {
    let state = createProjectGroup(EMPTY_PROJECT_GROUPS, "工作", "g1").state;
    state = createProjectGroup(state, "空", "g2").state;
    state = assignProjectToGroup(state, "/keep", "g1");
    state = assignProjectToGroup(state, "/gone", "g1");
    const next = pruneProjectGroups(state, ["/keep"]);
    expect(next.groups.map((g) => g.id)).toEqual(["g1", "g2"]);
    expect(next.membership).toEqual({ "/keep": "g1" });
  });
});

describe("loadProjectGroups", () => {
  it("returns empty for junk and keeps valid rows", () => {
    expect(loadProjectGroups(undefined)).toEqual(EMPTY_PROJECT_GROUPS);
    expect(loadProjectGroups({ groups: [{ id: "g1", name: "工作" }], membership: { "/a": "g1", "/b": "missing" } })).toEqual({
      groups: [{ id: "g1", name: "工作" }],
      membership: { "/a": "g1" },
    });
  });
});

describe("loadProjectOrder", () => {
  it("parses a string array, normalizes, dedupes, rejects junk", () => {
    expect(loadProjectOrder(null)).toEqual([]);
    expect(loadProjectOrder("nope")).toEqual([]);
    expect(loadProjectOrder(["/a/", 1, "/b", "/a"])).toEqual(["/a", "/b"]);
  });
});

describe("orderProjectPaths", () => {
  it("puts stored order first and keeps unranked relative order", () => {
    expect(orderProjectPaths(["/a", "/b", "/c"], ["/c", "/a"])).toEqual(["/c", "/a", "/b"]);
    expect(orderProjectPaths(["/a", "/b"], [])).toEqual(["/a", "/b"]);
  });
});

describe("orderProjectSections", () => {
  const proj = (path: string, band = "projects") => ({
    id: path,
    kind: "project" as const,
    band,
    projectPath: path,
    label: path,
    rows: [],
  });

  it("reorders only inside the same band", () => {
    const sections = [
      proj("/pin", "pin"),
      proj("/a"),
      proj("/b"),
      { id: "inbox", kind: "inbox" as const, band: "inbox", label: "inbox", rows: [] },
    ];
    const out = orderProjectSections(sections, ["/b", "/a", "/pin"]);
    expect(out.map((s) => s.id)).toEqual(["/pin", "/b", "/a", "inbox"]);
  });

  it("no-ops on an empty stored order", () => {
    const sections = [proj("/a"), proj("/b")];
    expect(orderProjectSections(sections, []).map((s) => s.id)).toEqual(["/a", "/b"]);
  });
});

describe("reorderProjectOrder", () => {
  it("inserts before/after the target inside the band", () => {
    expect(reorderProjectOrder([], ["/a", "/b", "/c"], "/c", "/a", true)).toEqual(["/c", "/a", "/b"]);
    expect(reorderProjectOrder([], ["/a", "/b", "/c"], "/a", "/b", false)).toEqual(["/b", "/a", "/c"]);
    expect(reorderProjectOrder([], ["/a", "/b"], "/a", null, true)).toEqual(["/b", "/a"]);
  });

  it("merges the band sequence back into the global order", () => {
    const order = ["/pin", "/a", "/b", "/c", "/other"];
    expect(reorderProjectOrder(order, ["/a", "/b", "/c"], "/a", "/c", false)).toEqual([
      "/pin",
      "/b",
      "/c",
      "/a",
      "/other",
    ]);
  });

  it("ignores a drag outside its own band", () => {
    expect(reorderProjectOrder(["/x"], ["/a"], "/z", "/a", true)).toEqual(["/x"]);
  });
});
