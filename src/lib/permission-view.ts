import type { RunStatusInput } from "./run-status";

export type PendingRequest = { title: string; toolKind?: string; sessionId?: string | null };
export type PermissionPane = string;
export type PermissionKind = "permission" | "question";
export type PermissionView = {
  kind: PermissionKind | null;
  pane: PermissionPane | null;
  mainVisible: boolean;
  splitVisible: boolean;
  statusPending: RunStatusInput["pending"];
};
export type PermissionPaneState = { id: string; sessionId: string | null; busy: boolean };
export type PermissionViewInput = {
  request: PendingRequest | null;
  mainSessionId: string | null;
  runningMainSessionId: string | null;
  splitSessionId: string | null;
  mainBusy: boolean;
  splitBusy: boolean;
  extraPanes?: PermissionPaneState[];
};

export function derivePermissionView(input: PermissionViewInput): PermissionView {
  if (!input.request) return { kind: null, pane: null, mainVisible: false, splitVisible: false, statusPending: null };
  const request = input.request;
  const kind: PermissionKind = request.toolKind === "question" || /ask|question|选择|提问/i.test(request.title)
    ? "question"
    : "permission";
  const extraHit = input.extraPanes?.find((p) => p.sessionId && p.sessionId === request.sessionId);
  const pane: PermissionPane = extraHit
    ? extraHit.id
    : request.sessionId
    ? input.splitSessionId === request.sessionId ? "split" : "main"
    : input.splitBusy && !input.mainBusy ? "split" : "main";
  const mainTarget = request.sessionId ?? input.runningMainSessionId;
  const mainVisible = pane === "main" && input.mainSessionId === mainTarget;
  const splitVisible = pane !== "main";
  return { kind, pane, mainVisible, splitVisible, statusPending: pane === "main" ? kind : null };
}

export function pendingRequestCardKind(view: PermissionView, pane: PermissionPane): PermissionKind | null {
  const visible = pane === "main" ? view.mainVisible : view.pane === pane && view.splitVisible;
  return visible ? view.kind : null;
}
