import type { RunStatusInput } from "./run-status";

export type PendingRequest = { title: string; toolKind?: string; sessionId?: string | null };
export type PermissionPane = "main" | "split";
export type PermissionKind = "permission" | "question";
export type PermissionView = {
  kind: PermissionKind | null;
  pane: PermissionPane | null;
  mainVisible: boolean;
  splitVisible: boolean;
  statusPending: RunStatusInput["pending"];
};
export type PermissionViewInput = {
  request: PendingRequest | null;
  mainSessionId: string | null;
  runningMainSessionId: string | null;
  splitSessionId: string | null;
  mainBusy: boolean;
  splitBusy: boolean;
};

export function derivePermissionView(input: PermissionViewInput): PermissionView {
  if (!input.request) return { kind: null, pane: null, mainVisible: false, splitVisible: false, statusPending: null };
  const kind: PermissionKind = input.request.toolKind === "question" || /ask|question|选择|提问/i.test(input.request.title)
    ? "question"
    : "permission";
  const pane: PermissionPane = input.request.sessionId
    ? input.splitSessionId === input.request.sessionId ? "split" : "main"
    : input.splitBusy && !input.mainBusy ? "split" : "main";
  const mainTarget = input.request.sessionId ?? input.runningMainSessionId;
  const mainVisible = pane === "main" && input.mainSessionId === mainTarget;
  const splitVisible = pane === "split";
  return { kind, pane, mainVisible, splitVisible, statusPending: pane === "main" ? kind : null };
}

export function pendingRequestCardKind(view: PermissionView, pane: PermissionPane): PermissionKind | null {
  const visible = pane === "main" ? view.mainVisible : view.splitVisible;
  return visible ? view.kind : null;
}
