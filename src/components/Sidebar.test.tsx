import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";
import type { SessionSummary } from "../api";
import { LocaleProvider } from "../lib/locale-context";
import { DEFAULT_SIDEBAR_LIST, type SidebarSection } from "../lib/sidebar-list";
import { Sidebar } from "./Sidebar";

function session(id: string, title: string, n: number): SessionSummary {
  const pad = String(n).padStart(2, "0");
  return {
    id,
    cwd: "/work/grok_build_desktop",
    title,
    updatedAt: `2026-09-06T00:${pad}:00.000Z`,
    createdAt: "2026-09-06T00:00:00.000Z",
    numMessages: 1,
  };
}

function projectSection(count: number): SidebarSection {
  const rows = Array.from({ length: count }, (_, i) => {
    const n = count - i;
    return {
      session: session(`s${n}`, `Sess ${String(n).padStart(2, "0")}`, n),
      indent: 0 as const,
      subtitle: "grok_build_desktop",
      projectPinned: false,
    };
  });
  return {
    id: "/work/grok_build_desktop",
    label: "grok_build_desktop",
    kind: "project",
    band: "projects",
    projectPath: "/work/grok_build_desktop",
    rows,
  };
}

function render(
  sectionCount = 13,
  extra?: {
    sections?: SidebarSection[];
    groups?: { id: string; name: string }[];
    groupMembership?: Record<string, string>;
    openGroups?: Record<string, boolean>;
    openProjects?: Record<string, boolean>;
  },
) {
  const noop = () => {};
  const sections = extra?.sections ?? [projectSection(sectionCount)];
  return renderToStaticMarkup(
    createElement(LocaleProvider, {
      locale: "zh",
      children: createElement(Sidebar, {
        sections,
        prefs: DEFAULT_SIDEBAR_LIST,
        onPrefs: noop,
        onSearch: noop,
        searchHits: null,
        onOpenHit: noop,
        onClearHits: noop,
        openProjects: extra?.openProjects ?? { "/work/grok_build_desktop": true },
        onToggleProject: noop,
        onPinProject: noop,
        groups: extra?.groups,
        groupMembership: extra?.groupMembership,
        openGroups: extra?.openGroups,
        onToggleGroup: noop,
        onCreateGroup: () => ({ id: "g_new", name: "新分组" }),
        onCreateGroupForProject: () => ({ id: "g_new", name: "新分组" }),
        onMoveProjectToGroup: noop,
        onRenameGroup: noop,
        onDeleteGroup: noop,
        sessionId: null,
        titles: {},
        expandedIds: new Set<string>(),
        collapsedIds: new Set<string>(),
        onToggleExpand: noop,
        onOpenSession: noop,
        onSessionMenu: noop,
        onNewChat: noop,
        onNewProjectSession: noop,
        onAddProject: noop,
        picking: false,
        statusFor: () => "idle" as const,
        signedIn: false,
        onSettings: noop,
        onExtensions: noop,
        onShortcuts: noop,
        onCollapseAll: noop,
        onMarkAllRead: noop,
        showTokens: false,
        showStatus: false,
        showWorktree: false,
      }),
    }),
  );
}

describe("Sidebar project session window", () => {
  it("puts a plus on the project row to start a session in that folder", () => {
    const html = render(3);
    expect(html).toContain("project-new");
    expect(html).toContain("在此项目新开会话");
  });

  it("shows 6 recent sessions and a show-more control when the folder is long", () => {
    const html = render(13);
    expect(html).toContain("Sess 13");
    expect(html).toContain("Sess 08");
    expect(html).not.toContain("Sess 07");
    expect(html).not.toContain("Sess 01");
    expect(html).toContain("展开更多");
    expect(html).toContain("project-sessions-clip is-clipped");
  });

  it("shows every session when leftover is 4 or fewer", () => {
    const html = render(10);
    expect(html).toContain("Sess 01");
    expect(html).not.toContain("展开更多");
    expect(html).not.toContain("is-clipped");
  });
});

describe("Sidebar project groups", () => {
  const grouped: SidebarSection[] = [
    {
      id: "/work/other",
      label: "other",
      kind: "project",
      band: "group:g-work",
      projectPath: "/work/other",
      groupId: "g-work",
      groupLabel: "工作",
      rows: [
        {
          session: session("s1", "Other sess", 1),
          indent: 0,
          subtitle: "other",
          projectPinned: false,
        },
      ],
    },
    {
      id: "group:g-life",
      label: "个人",
      kind: "group",
      band: "group:g-life",
      groupId: "g-life",
      groupLabel: "个人",
      rows: [],
    },
    projectSection(3),
  ];

  it("renders group folders with drop targets and keeps empty groups", () => {
    const html = render(3, {
      sections: grouped,
      groups: [
        { id: "g-work", name: "工作" },
        { id: "g-life", name: "个人" },
      ],
      openProjects: { "/work/other": true, "/work/grok_build_desktop": true },
    });
    expect(html).toContain("data-project-drop=\"group:g-work\"");
    expect(html).toContain("data-project-drop=\"group:g-life\"");
    expect(html).toContain("data-project-drop=\"ungrouped\"");
    expect(html).toContain("工作");
    expect(html).toContain("个人");
    expect(html).toContain("项目");
    expect(html).toContain("group-head");
    expect(html).not.toContain("group-chev");
    expect(html).toContain("aria-expanded=\"true\"");
  });

  it("collapses a group when it is marked closed", () => {
    const html = render(3, {
      sections: [grouped[0]],
      groups: [{ id: "g-work", name: "工作" }],
      openGroups: { "g-work": false },
      openProjects: { "/work/other": true },
    });
    expect(html).toContain("group-head");
    expect(html).toContain("aria-expanded=\"false\"");
    expect(html).toContain("class=\"group-projects\"");
    expect(html).not.toContain("group-projects open");
  });
});

