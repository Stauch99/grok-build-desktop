import { describe, expect, it } from "vitest";
import type { SessionSummary } from "../api";
import type { SidebarSection } from "./sidebar-list";
import {
  filterSidebarSections,
  loadSidebarDensity,
  loadSidebarQuickFilter,
  matchesQuickFilter,
  nextSidebarDensity,
  storageGet,
  storageGetJson,
  storageSet,
} from "./sidebar-local";

function row(id: string): { session: SessionSummary; indent: 0; subtitle: string; projectPinned: boolean } {
  return {
    session: {
      id,
      cwd: "/p",
      title: id,
      updatedAt: "2026-01-01T00:00:00Z",
      createdAt: "2026-01-01T00:00:00Z",
      numMessages: 1,
    },
    indent: 0,
    subtitle: "p",
    projectPinned: false,
  };
}

function section(id: string, kind: SidebarSection["kind"], ids: string[]): SidebarSection {
  return { id, label: id, kind, band: "projects", rows: ids.map(row) };
}

describe("loadSidebarQuickFilter", () => {
  it("falls back to all on junk", () => {
    expect(loadSidebarQuickFilter(null)).toBe("all");
    expect(loadSidebarQuickFilter("bogus")).toBe("all");
    expect(loadSidebarQuickFilter("needs-you")).toBe("needs-you");
    expect(loadSidebarQuickFilter("working")).toBe("working");
  });
});

describe("matchesQuickFilter", () => {
  it("needs-you includes error rows; working is strict", () => {
    expect(matchesQuickFilter("needs-you", "needs-you")).toBe(true);
    expect(matchesQuickFilter("error", "needs-you")).toBe(true);
    expect(matchesQuickFilter("done", "needs-you")).toBe(false);
    expect(matchesQuickFilter("working", "working")).toBe(true);
    expect(matchesQuickFilter("idle", "all")).toBe(true);
  });
});

describe("filterSidebarSections", () => {
  const statusFor = (id: string) =>
    id === "a" ? "needs-you" : id === "b" ? "working" : id === "c" ? "error" : ("idle" as const);

  it("keeps matching rows and drops emptied sections", () => {
    const sections = [
      section("s1", "project", ["a", "d"]),
      section("s2", "project", ["d"]),
      section("s3", "inbox", ["b"]),
    ];
    const out = filterSidebarSections(sections, "needs-you", statusFor);
    expect(out.map((s) => s.id)).toEqual(["s1"]);
    expect(out[0].rows.map((r) => r.session.id)).toEqual(["a"]);
  });

  it("passes everything through on all", () => {
    const sections = [section("s1", "project", ["a"])];
    expect(filterSidebarSections(sections, "all", statusFor)).toHaveLength(1);
  });
});

describe("loadSidebarDensity", () => {
  it("defaults comfortable, honors compact, toggles", () => {
    expect(loadSidebarDensity(null)).toBe("comfortable");
    expect(loadSidebarDensity("compact")).toBe("compact");
    expect(nextSidebarDensity("comfortable")).toBe("compact");
    expect(nextSidebarDensity("compact")).toBe("comfortable");
  });
});

describe("storage helpers", () => {
  it("round-trips and survives junk json", () => {
    storageSet("grok.test", "v1");
    expect(storageGet("grok.test")).toBe("v1");
    storageSet("grok.test.json", JSON.stringify([1, 2]));
    expect(storageGetJson("grok.test.json")).toEqual([1, 2]);
    storageSet("grok.test.bad", "{oops");
    expect(storageGetJson("grok.test.bad")).toBeNull();
    expect(storageGet("grok.test.missing")).toBeNull();
  });
});
