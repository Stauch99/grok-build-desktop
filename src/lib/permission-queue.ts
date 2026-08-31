import { t, type Locale } from "./i18n";
import { derivePermissionView, type PermissionViewInput } from "./permission-view";
import type { AgentId } from "./agent-id";
import { asRecord } from "./text";

export const PERMISSION_TIMEOUT_MS = 90_000;

/** In-memory allow-list: session id → Set of tool names remembered this session. */
export type SessionAllowList = Map<string, Set<string>>;

export function rememberTool(
  allowed: SessionAllowList,
  sessionId: string,
  toolName: string,
): SessionAllowList {
  const next = new Map(allowed);
  const tools = new Set(next.get(sessionId) ?? []);
  if (sessionId && toolName) tools.add(toolName);
  next.set(sessionId, tools);
  return next;
}

export function isRememberedTool(
  allowed: SessionAllowList,
  sessionId: string | null | undefined,
  toolName: string,
): boolean {
  if (!sessionId || !toolName) return false;
  return allowed.get(sessionId)?.has(toolName) ?? false;
}

export function secondsUntilReject(
  receivedAt: number,
  now: number,
  timeoutMs = PERMISSION_TIMEOUT_MS,
): number {
  return Math.max(0, Math.ceil((receivedAt + timeoutMs - now) / 1000));
}

export function rejectCountdownLabel(seconds: number, locale: Locale): string {
  return t(locale, "perm.rejectIn", { n: seconds });
}


export type QueuedPermission = {
  rpcId: number | string;
  title: string;
  toolKind?: string;
  options: { optionId: string; name: string; kind?: string }[];
  sessionId?: string | null;
  receivedAt: number;
  timedOut: boolean;
  agentId: AgentId;
};
export type PermissionContext = Omit<PermissionViewInput, "request">;
const sameRequest = (a: QueuedPermission, b: QueuedPermission) => a.rpcId === b.rpcId && (a.sessionId ?? null) === (b.sessionId ?? null);
export const enqueuePermission = (queue: QueuedPermission[], request: QueuedPermission) => queue.some((item) => sameRequest(item, request)) ? queue : [...queue, request];
export const removePermission = (queue: QueuedPermission[], request: QueuedPermission) => queue.filter((item) => !sameRequest(item, request));
export const markPermissionTimedOut = (queue: QueuedPermission[], request: QueuedPermission) => queue.map((item) => sameRequest(item, request) ? { ...item, timedOut: true } : item);
export function selectPanePermissions(queue: QueuedPermission[], context: PermissionContext): Record<string, QueuedPermission | null> {
  const result: Record<string, QueuedPermission | null> = { main: null, split: null };
  for (const pane of context.extraPanes ?? []) result[pane.id] = null;
  for (const request of queue) {
    const pane = derivePermissionView({ ...context, request }).pane;
    if (pane && result[pane] === undefined) result[pane] = null;
    if (pane && !result[pane]) result[pane] = request;
  }
  return result;
}
/** Number shortcuts target the focused pane; if focus is unknown or both are visible, main wins. */
export function selectShortcutPermission(queue: QueuedPermission[], context: PermissionContext, focusedPane: string | null): QueuedPermission | null {
  const selected = selectPanePermissions(queue, context);
  if (focusedPane && selected[focusedPane]) return selected[focusedPane];
  return selected.main ?? Object.values(selected).find(Boolean) ?? null;
}

export type AcpPermissionMessage = {
  method?: string;
  id?: number | string;
  params?: unknown;
};

export function permissionFromAcpRequest(
  msg: AcpPermissionMessage,
  agentId: AgentId,
  now = Date.now(),
): QueuedPermission | null {
  if (msg.method !== "session/request_permission" || msg.id === undefined) return null;
  const params = asRecord(msg.params);
  const tool = asRecord(params.toolCall);
  const options = (Array.isArray(params.options) ? params.options : [])
    .map((o) => asRecord(o))
    .filter((o) => typeof o.optionId === "string" && typeof o.name === "string")
    .map((o) => ({ optionId: String(o.optionId), name: String(o.name), kind: String(o.kind ?? "") }));
  return {
    rpcId: msg.id,
    title: String(tool.title || "需要许可"),
    toolKind: String(tool.kind ?? tool.toolKind ?? ""),
    options,
    sessionId: typeof params.sessionId === "string" ? params.sessionId : null,
    receivedAt: now,
    timedOut: false,
    agentId,
  };
}
