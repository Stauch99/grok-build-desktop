import { describe, expect, it } from "vitest";
import {
  dashboardStatus,
  deriveHero,
  mainPaneIsBusy,
  mapDashboardSessions,
  permissionContextFrom,
  planIsComplete,
  reviewDataFrom,
  ruleFilePath,
  trustRequired,
} from "./app-view";
import { deriveReviewTabs, reconcileReviewTab } from "./review-rail";
import { deriveRunStatus } from "./run-status";
import { agentHealth } from "./agent-health";

describe("planIsComplete", () => {
  it("is true only in plan mode when every entry is completed", () => {
    expect(planIsComplete("plan", [{ status: "completed" }, { status: "completed" }])).toBe(true);
    expect(planIsComplete("plan", [{ status: "pending" }])).toBe(false);
    expect(planIsComplete("plan", [])).toBe(false);
    expect(planIsComplete("agent", [{ status: "completed" }])).toBe(false);
  });
});

describe("dashboard sessions", () => {
  it("maps sidebar status onto the dashboard vocabulary", () => {
    expect(dashboardStatus("needs-you")).toBe("needs-input");
    expect(dashboardStatus("working")).toBe("running");
    expect(dashboardStatus("idle")).toBe("idle");
    expect(dashboardStatus("done")).toBe("idle");
    expect(dashboardStatus("error")).toBe("idle");
  });

  it("uses display titles and per-session status", () => {
    const rows = mapDashboardSessions(
      [
        { id: "a", title: "生成名" },
        { id: "b", title: "另一个" },
      ],
      { a: "手改" },
      (id) => (id === "a" ? "needs-you" : "working"),
    );
    expect(rows).toEqual([
      { id: "a", title: "手改", status: "needs-input" },
      { id: "b", title: "另一个", status: "running" },
    ]);
  });
});

describe("permissionContextFrom", () => {
  it("names the two panes the permission queue expects", () => {
    expect(
      permissionContextFrom({
        sessionId: "main",
        runningSessionId: "run",
        splitId: "split",
        busy: true,
        splitBusy: false,
      }),
    ).toEqual({
      mainSessionId: "main",
      runningMainSessionId: "run",
      splitSessionId: "split",
      mainBusy: true,
      splitBusy: false,
    });
  });
});

describe("deriveHero", () => {
  it("keeps the empty-session hero and also blocks while the agent is warming up", () => {
    expect(deriveHero({ hasMessages: false, hasCwd: true, connecting: false, ready: true })).toEqual({
      hero: true,
      blocked: false,
    });
    expect(deriveHero({ hasMessages: true, hasCwd: true, connecting: true, ready: false })).toEqual({
      hero: false,
      blocked: true,
    });
    expect(deriveHero({ hasMessages: false, hasCwd: false, connecting: false, ready: true })).toEqual({
      hero: true,
      blocked: true,
    });
  });
});

describe("reviewDataFrom", () => {
  it("counts the plan file plus project rules as context", () => {
    expect(
      reviewDataFrom({
        planCount: 2,
        fileCount: 3,
        changeCount: 4,
        hasPlanFile: true,
        ruleCount: 2,
        hasDetails: true,
        hasPreview: true,
        bashCount: 1,
      }),
    ).toEqual({
      planCount: 2,
      fileCount: 3,
      changeCount: 4,
      contextCount: 3,
      hasDetails: true,
      hasPreview: true,
      bashCount: 1,
    });
  });

  it("keeps Git available when defaultRail is the legacy changes alias", () => {
    const tabs = deriveReviewTabs(
      reviewDataFrom({
        planCount: 0,
        fileCount: 0,
        changeCount: 0,
        hasPlanFile: false,
        ruleCount: 0,
        hasDetails: false,
        hasPreview: false,
        bashCount: 0,
      }),
    );
    expect(tabs.find((t) => t.id === "git")?.available).toBe(true);
    expect(reconcileReviewTab("changes", tabs, "changes")).toBe("git");
  });
});

describe("ruleFilePath / trustRequired", () => {
  it("finds MEMORY.md and AGENTS.md by name", () => {
    const rules = [
      { name: "AGENTS.md", path: "/p/AGENTS.md" },
      { name: "MEMORY.md", path: "/p/MEMORY.md" },
    ];
    expect(ruleFilePath(rules, "MEMORY.md")).toBe("/p/MEMORY.md");
    expect(ruleFilePath(rules, "AGENTS.md")).toBe("/p/AGENTS.md");
    expect(ruleFilePath(rules, "missing")).toBeUndefined();
  });

  it("requires trust only when inspect says the project is untrusted", () => {
    expect(trustRequired({ projectTrusted: false }, "/work")).toBe(true);
    expect(trustRequired({ projectTrusted: true }, "/work")).toBe(false);
    expect(trustRequired(null, "/work")).toBe(false);
    expect(trustRequired({ projectTrusted: false }, "")).toBe(false);
  });
});

describe("mainPaneIsBusy", () => {
  it("hides running chrome only when another session is the one in flight", () => {
    expect(mainPaneIsBusy({ busy: false, sessionId: "a", runningSessionId: "a" })).toBe(false);
    expect(mainPaneIsBusy({ busy: true, sessionId: "a", runningSessionId: "a" })).toBe(true);
    expect(mainPaneIsBusy({ busy: true, sessionId: "b", runningSessionId: "a" })).toBe(false);
  });

  it("still shows running while the session id is catching up after send", () => {
    expect(mainPaneIsBusy({ busy: true, sessionId: null, runningSessionId: null })).toBe(true);
    expect(mainPaneIsBusy({ busy: true, sessionId: "a", runningSessionId: null })).toBe(true);
    expect(mainPaneIsBusy({ busy: true, sessionId: null, runningSessionId: "a" })).toBe(true);
  });
});

describe("run status wiring", () => {
  it("treats a disconnected agent as the top status even while a plan is complete", () => {
    const health = agentHealth({ ready: false, connecting: false, sawExit: true });
    expect(
      deriveRunStatus({
        disconnected: health === "disconnected",
        trustRequired: false,
        pending: null,
        running: false,
        stalled: false,
        planComplete: true,
      }).kind,
    ).toBe("disconnected");
  });
});
