import { describe, expect, it } from "vitest";
import {
  busyComposerHint,
  composerTakeover,
  paneComposerTakeover,
  contextSummary,
  heroLayout,
  messageFeedbackSupported,
  packagedRuntimeOk,
  SIDEBAR_RAIL,
  situationAutoCollapse,
  tasksSections,
  trayMenuLabels,
} from "./shell-ia";

describe("tasksSections", () => {
  it("unmounts empty groups", () => {
    expect(tasksSections({ planCount: 0, turnFileCount: 0 })).toEqual({
      showPlan: false,
      showTurnFiles: false,
    });
  });

  it("shows plan and this-turn files only", () => {
    expect(tasksSections({ planCount: 2, turnFileCount: 1 })).toEqual({
      showPlan: true,
      showTurnFiles: true,
    });
  });
});

describe("situationAutoCollapse", () => {
  it("collapses the Situation column below 1024", () => {
    expect(situationAutoCollapse(1023)).toBe(true);
    expect(situationAutoCollapse(1024)).toBe(false);
  });
});

describe("paneComposerTakeover", () => {
  it("uses only pending state owned by the requested pane", () => {
    expect(paneComposerTakeover({ pane: "split", pendingPane: "split", pendingKind: "question", plan: false })).toBe("question");
    expect(paneComposerTakeover({ pane: "main", pendingPane: "split", pendingKind: "permission", plan: true })).toBe("plan");
    expect(paneComposerTakeover({ pane: "split", pendingPane: "main", pendingKind: "permission", plan: false })).toBe("bar");
  });
});

describe("composerTakeover", () => {
  it("covers the input: permission then question then plan", () => {
    expect(composerTakeover({ permission: true, question: true, plan: true })).toBe("permission");
    expect(composerTakeover({ permission: false, question: true, plan: true })).toBe("question");
    expect(composerTakeover({ permission: false, question: false, plan: true })).toBe("plan");
    expect(composerTakeover({ permission: false, question: false, plan: false })).toBe("bar");
  });
});

describe("heroLayout", () => {
  it("centers an empty session and blocks typing without a workspace", () => {
    expect(heroLayout({ hasMessages: false, hasCwd: false })).toEqual({
      hero: true,
      blocked: true,
    });
    expect(heroLayout({ hasMessages: false, hasCwd: true })).toEqual({
      hero: true,
      blocked: false,
    });
    expect(heroLayout({ hasMessages: true, hasCwd: true })).toEqual({
      hero: false,
      blocked: false,
    });
  });
});

describe("contextSummary", () => {
  it("returns counts instead of dumping full panels", () => {
    expect(contextSummary({ mcp: 3, lsp: 1, rules: 2, sandboxOn: true })).toEqual({
      mcp: 3,
      lsp: 1,
      rules: 2,
      sandbox: 1,
    });
  });
});

describe("busyComposerHint", () => {
  it("names queue vs steer while busy", () => {
    expect(busyComposerHint(false)).toBe("忙碌时回车会排队");
    expect(busyComposerHint(true)).toBe("忙碌时回车会改向");
    expect(busyComposerHint(false, "en")).toBe("Enter queues while busy");
    expect(busyComposerHint(true, "en")).toBe("Enter steers while busy");
  });
});

describe("trayMenuLabels", () => {
  it("adds last-session under show", () => {
    expect(trayMenuLabels()).toEqual(["显示窗口", "打开上次会话", "退出"]);
    expect(trayMenuLabels("en")).toEqual(["Show window", "Open last session", "Quit"]);
  });
});

describe("messageFeedbackSupported", () => {
  it("is false because grok CLI has no thumbs API", () => {
    expect(messageFeedbackSupported()).toBe(false);
  });
});

describe("packagedRuntimeOk", () => {
  it("fails when the grok binary is missing", () => {
    expect(packagedRuntimeOk({ grokBin: false })).toBe(false);
    expect(packagedRuntimeOk({ grokBin: true })).toBe(true);
  });
});

describe("SIDEBAR_RAIL", () => {
  it("is wide enough for traffic lights", () => {
    expect(SIDEBAR_RAIL).toBeGreaterThanOrEqual(72);
  });
});
