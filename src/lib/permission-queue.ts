import { derivePermissionView, type PermissionPane, type PermissionViewInput } from "./permission-view";

export type QueuedPermission = {
  rpcId: number | string;
  title: string;
  toolKind?: string;
  options: { optionId: string; name: string; kind?: string }[];
  sessionId?: string | null;
  receivedAt: number;
  timedOut: boolean;
};
export type PermissionContext = Omit<PermissionViewInput, "request">;
const sameRequest = (a: QueuedPermission, b: QueuedPermission) => a.rpcId === b.rpcId && (a.sessionId ?? null) === (b.sessionId ?? null);
export const enqueuePermission = (queue: QueuedPermission[], request: QueuedPermission) => queue.some((item) => sameRequest(item, request)) ? queue : [...queue, request];
export const removePermission = (queue: QueuedPermission[], request: QueuedPermission) => queue.filter((item) => !sameRequest(item, request));
export const markPermissionTimedOut = (queue: QueuedPermission[], request: QueuedPermission) => queue.map((item) => sameRequest(item, request) ? { ...item, timedOut: true } : item);
export function selectPanePermissions(queue: QueuedPermission[], context: PermissionContext): Record<PermissionPane, QueuedPermission | null> {
  const result: Record<PermissionPane, QueuedPermission | null> = { main: null, split: null };
  for (const request of queue) {
    const pane = derivePermissionView({ ...context, request }).pane;
    if (pane && !result[pane]) result[pane] = request;
  }
  return result;
}
/** Number shortcuts target the focused pane; if focus is unknown or both are visible, main wins. */
export function selectShortcutPermission(queue: QueuedPermission[], context: PermissionContext, focusedPane: PermissionPane | null): QueuedPermission | null {
  const selected = selectPanePermissions(queue, context);
  if (focusedPane && selected[focusedPane]) return selected[focusedPane];
  return selected.main ?? selected.split;
}
