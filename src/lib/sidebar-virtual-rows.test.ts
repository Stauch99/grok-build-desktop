import { describe, expect, it } from "vitest";
import type { SessionSummary } from "../api";
import type { SidebarSection } from "./sidebar-list";
import {
  flattenSidebarListItems,
  shouldVirtualizeSidebar,
  SIDEBAR_VIRTUALIZE_AFTER,
} from "./sidebar-virtual-rows";

function session(id: string, n: number): SessionSummary {
  const pad = String(n).padStart(2, "0");
  return {
    id,
    cwd: "/work/p",
    title: `S${n}`,
    updatedAt: `2026-09-06T00:${pad}:00.000Z`,
    createdAt: "2026-09-06T00:00:00.000Z",
    numMessages: 1,
  };
}

function project(id: string, n: number): SidebarSection {
  return {
    id,
    label: id,
    kind: "project",
    band: "projects",
    projectPath: id,
    rows: [
      {
        session: session(id, n),
        indent: 0,
        subtitle: "p",
        projectPinned: false,
      },
    ],
  };
}

describe("flattenSidebarListItems", () => {
  it("keeps a band label plus each project section", () => {
    const items = flattenSidebarListItems([project("/a", 1), project("/b", 2)]);
    expect(items.map((row) => row.kind)).toEqual(["band-label", "section", "section"]);
    expect(shouldVirtualizeSidebar(items)).toBe(false);
  });

  it("virtualizes once the flattened list grows past 24 rows", () => {
    expect(SIDEBAR_VIRTUALIZE_AFTER).toBe(24);
    const many = Array.from({ length: 25 }, (_, i) => project(`/p${i}`, i));
    const items = flattenSidebarListItems(many);
    expect(items.length).toBeGreaterThan(24);
    expect(shouldVirtualizeSidebar(items)).toBe(true);
  });
});
