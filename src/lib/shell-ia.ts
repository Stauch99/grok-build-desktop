export const SIDEBAR_RAIL = 90;

export function tasksSections(opts: { planCount: number; turnFileCount: number }): {
  showPlan: boolean;
  showTurnFiles: boolean;
} {
  return {
    showPlan: opts.planCount > 0,
    showTurnFiles: opts.turnFileCount > 0,
  };
}

export function situationAutoCollapse(windowWidth: number, threshold = 1024): boolean {
  return windowWidth < threshold;
}

export type TakeoverKind = "permission" | "question" | "plan" | "bar";

export function composerTakeover(opts: {
  permission: boolean;
  question: boolean;
  plan: boolean;
}): TakeoverKind {
  if (opts.permission) return "permission";
  if (opts.question) return "question";
  if (opts.plan) return "plan";
  return "bar";
}

export function heroLayout(opts: { hasMessages: boolean; hasCwd: boolean }): {
  hero: boolean;
  blocked: boolean;
} {
  return { hero: !opts.hasMessages, blocked: !opts.hasCwd };
}

export function contextSummary(opts: {
  mcp: number;
  lsp: number;
  rules: number;
  sandboxOn: boolean;
}): { mcp: number; lsp: number; rules: number; sandbox: number } {
  return {
    mcp: opts.mcp,
    lsp: opts.lsp,
    rules: opts.rules,
    sandbox: opts.sandboxOn ? 1 : 0,
  };
}

export function busyComposerHint(steerByDefault: boolean): string {
  return steerByDefault ? "忙碌时回车会改向" : "忙碌时回车会排队";
}

export function trayMenuLabels(): string[] {
  return ["显示窗口", "打开上次会话", "退出"];
}

export function messageFeedbackSupported(): boolean {
  return false;
}

export function packagedRuntimeOk(opts: { grokBin: boolean }): boolean {
  return opts.grokBin;
}

export function paneComposerTakeover(opts: { pane: "main" | "split"; pendingPane: "main" | "split" | null; pendingKind: "permission" | "question" | null; plan: boolean }): TakeoverKind {
  return composerTakeover({ permission: opts.pendingPane === opts.pane && opts.pendingKind === "permission", question: opts.pendingPane === opts.pane && opts.pendingKind === "question", plan: opts.plan });
}
