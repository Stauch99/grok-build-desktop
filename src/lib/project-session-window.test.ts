import { describe, expect, it } from "vitest";
import type { SessionSummary } from "../api";
import type { SessionNode } from "./projects";
import {
  PROJECT_SESSION_INITIAL,
  extraPagesToInclude,
  projectSessionWindow,
  windowedProjectNodes,
} from "./project-session-window";

describe("projectSessionWindow", () => {
  it("shows every session when the folder is within the first page", () => {
    expect(projectSessionWindow(6, 0)).toEqual({ shown: 6, hasMore: false });
    expect(projectSessionWindow(3, 0)).toEqual({ shown: 3, hasMore: false });
    expect(projectSessionWindow(0, 0)).toEqual({ shown: 0, hasMore: false });
  });

  it("dumps a leftover of 4 or fewer instead of offering another page", () => {
    expect(projectSessionWindow(7, 0)).toEqual({ shown: 7, hasMore: false });
    expect(projectSessionWindow(10, 0)).toEqual({ shown: 10, hasMore: false });
  });

  it("starts at 6 and pages by 5 while leftover stays above 4", () => {
    expect(projectSessionWindow(11, 0)).toEqual({ shown: PROJECT_SESSION_INITIAL, hasMore: true });
    expect(projectSessionWindow(11, 1)).toEqual({ shown: 11, hasMore: false });

    expect(projectSessionWindow(13, 0)).toEqual({ shown: 6, hasMore: true });
    expect(projectSessionWindow(13, 1)).toEqual({ shown: 13, hasMore: false });

    expect(projectSessionWindow(16, 0)).toEqual({ shown: 6, hasMore: true });
    expect(projectSessionWindow(16, 1)).toEqual({ shown: 11, hasMore: true });
    expect(projectSessionWindow(16, 2)).toEqual({ shown: 16, hasMore: false });
  });

  it("keeps paging while more than 10 remain after a page", () => {
    expect(projectSessionWindow(27, 0)).toEqual({ shown: 6, hasMore: true });
    expect(projectSessionWindow(27, 1)).toEqual({ shown: 11, hasMore: true });
    expect(projectSessionWindow(27, 2)).toEqual({ shown: 16, hasMore: true });
    expect(projectSessionWindow(27, 3)).toEqual({ shown: 21, hasMore: true });
    expect(projectSessionWindow(27, 4)).toEqual({ shown: 27, hasMore: false });
  });
});

describe("extraPagesToInclude", () => {
  it("opens enough pages for a session past the first window", () => {
    expect(extraPagesToInclude(20, 0)).toBe(0);
    expect(extraPagesToInclude(20, 5)).toBe(0);
    expect(extraPagesToInclude(20, 6)).toBe(1);
    expect(extraPagesToInclude(20, 12)).toBe(2);
  });
});

function leaf(id: string): SessionNode {
  const session: SessionSummary = {
    id,
    cwd: "/work",
    title: id,
    updatedAt: "2026-09-06T00:00:00.000Z",
    createdAt: "2026-09-06T00:00:00.000Z",
    numMessages: 1,
  };
  return { session, children: [] };
}

describe("windowedProjectNodes", () => {
  it("slices top-level nodes and auto-reveals the active ancestor", () => {
    const nodes = Array.from({ length: 13 }, (_, i) => leaf(`s${i}`));
    const first = windowedProjectNodes(nodes, 0);
    expect(first.nodes.map((n) => n.session.id)).toEqual(["s0", "s1", "s2", "s3", "s4", "s5"]);
    expect(first.hasMore).toBe(true);

    const opened = windowedProjectNodes(nodes, 1);
    expect(opened.nodes).toHaveLength(13);
    expect(opened.hasMore).toBe(false);

    const revealed = windowedProjectNodes(nodes, 0, "s12");
    expect(revealed.nodes).toHaveLength(13);
    expect(revealed.hasMore).toBe(false);
  });
});
