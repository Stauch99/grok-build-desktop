import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";
import type { SessionSummary } from "../api";
import { AGENT_IDS } from "../lib/agent-id";
import type { SessionNode } from "../lib/projects";
import { SessionBranch, type SessionBranchProps } from "./SessionBranch";

function session(partial: Partial<SessionSummary> & Pick<SessionSummary, "id">): SessionSummary {
  return {
    cwd: "/work",
    title: partial.id,
    updatedAt: "2026-09-06T00:00:00.000Z",
    createdAt: "2026-09-06T00:00:00.000Z",
    numMessages: 1,
    ...partial,
  };
}

function render(node: SessionNode, extra: Partial<SessionBranchProps> = {}) {
  return renderToStaticMarkup(
    createElement(SessionBranch, {
      node,
      depth: 0,
      rowKind: "project",
      sessionId: null,
      titles: {},
      expandedIds: extra.expandedIds ?? new Set(),
      collapsedIds: extra.collapsedIds ?? new Set(),
      onToggleExpand: extra.onToggleExpand ?? (() => {}),
      onOpen: extra.onOpen ?? (() => {}),
      onMenu: extra.onMenu ?? (() => {}),
      ...extra,
    }),
  );
}

describe("SessionBranch subagent chrome", () => {
  it("puts a numbered circle on the parent row without a reserved title slot", () => {
    const html = render({
      session: session({ id: "p", title: "个人理财实战", agentId: "claude" }),
      children: [
        { session: session({ id: "c1", title: "调研", agentId: "claude" }), children: [] },
        { session: session({ id: "c2", title: "草稿", agentId: "claude" }), children: [] },
      ],
    });
    expect(html).toContain("sess-kid-count");
    expect(html).toMatch(/sess-kid-count[^>]*>2</);
    expect(html.indexOf("sess-kid-count")).toBeLessThan(html.indexOf("sess-title"));
    expect(html).not.toContain("sess-gutter");
    expect(html).not.toMatch(/class="count"/);
    expect(html).not.toContain("branch-chev");
  });

  it("does not insert a left gutter on leaf sessions", () => {
    const html = render({
      session: session({ id: "leaf", title: "A股和个股的区别", agentId: "grok" }),
      children: [],
    });
    expect(html).not.toContain("sess-gutter");
    expect(html).not.toContain("sess-kid-count");
    expect(html).not.toContain("branch-chev");
  });

  it("marks the CLI with an svg icon instead of a text pill", () => {
    const html = render({
      session: session({ id: "p", title: "Finance", agentId: "claude" }),
      children: [],
    });
    expect(html).toContain('class="sess-agent sess-agent-claude"');
    expect(html).toContain('aria-label="Claude"');
    expect(html).toContain("<svg");
    expect(html).not.toMatch(/sess-agent[^>]*>Claude</);
  });

  it("renders a distinct svg for every AgentId", () => {
    const marks = AGENT_IDS.map((id) =>
      render({
        session: session({ id, title: id, agentId: id }),
        children: [],
      }),
    );
    const svgs = marks.map((html) => html.match(/<svg[\s\S]*?<\/svg>/)?.[0] ?? "");
    expect(svgs.every(Boolean)).toBe(true);
    expect(new Set(svgs).size).toBe(AGENT_IDS.length);
  });
});
