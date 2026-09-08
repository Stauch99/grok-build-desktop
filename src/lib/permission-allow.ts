/** In-memory session tool allowlist key: `${sessionId}::${toolName}`. */
export type AllowKey = `${string}::${string}`;

export type PermissionOption = {
  optionId: string;
  name: string;
  kind?: string;
};

export function allowKey(sessionId: string, toolName: string): AllowKey {
  return `${sessionId}::${toolName}`;
}

/** Durable grant: same agent + project + tool, survives restarts. */
export function grantKey(agentId: string, cwd: string, toolName: string): string {
  return `${agentId}::${cwd}::${toolName}`;
}

export function parseGrantKey(key: string): { agentId: string; cwd: string; tool: string } | null {
  const parts = key.split("::");
  if (parts.length < 3) return null;
  const agentId = parts[0] ?? "";
  const tool = parts[parts.length - 1] ?? "";
  const cwd = parts.slice(1, -1).join("::");
  if (!agentId || !cwd || !tool) return null;
  return { agentId, cwd, tool };
}

/** Prefer toolKind; otherwise first whitespace token of title. */
export function parseToolName(title: string, toolKind?: string): string {
  const kind = toolKind?.trim();
  if (kind) return kind;
  const token = title.trim().split(/\s+/)[0] ?? "";
  return token;
}

export function shouldSkipPermission(
  allowed: Set<string>,
  sessionId: string | null | undefined,
  toolName: string,
  grant?: { agentId: string; cwd: string },
): boolean {
  if (!toolName) return false;
  if (grant?.agentId && grant.cwd && allowed.has(grantKey(grant.agentId, grant.cwd, toolName))) {
    return true;
  }
  if (!sessionId) return false;
  return allowed.has(allowKey(sessionId, toolName));
}

/** Composer 始终批准 skips tool permission cards. AskUserQuestion stays interactive. */
export function shouldAutoApprovePermission(
  yolo: boolean,
  kind: "permission" | "question",
): boolean {
  return yolo && kind === "permission";
}

export function allowForSession(
  allowed: Set<string>,
  sessionId: string,
  toolName: string,
): Set<string> {
  const next = new Set(allowed);
  if (sessionId && toolName) next.add(allowKey(sessionId, toolName));
  return next;
}

export function allowForGrant(
  allowed: Set<string>,
  agentId: string,
  cwd: string,
  toolName: string,
): Set<string> {
  const next = new Set(allowed);
  if (agentId && cwd && toolName) next.add(grantKey(agentId, cwd, toolName));
  return next;
}

function optionText(opt: PermissionOption): string {
  return `${opt.name} ${opt.kind ?? ""}`;
}

function isAlwaysLike(text: string): boolean {
  const t = text.toLowerCase();
  return t.includes("always") || t.includes("总是") || t.includes("session");
}

function isRejectLike(text: string): boolean {
  const t = text.toLowerCase();
  return (
    t.includes("reject") ||
    t.includes("deny") ||
    t.includes("cancel") ||
    t.includes("拒绝") ||
    t.includes("取消") ||
    t.includes("不允许") ||
    t.includes("禁止")
  );
}

function isAllowLike(text: string): boolean {
  if (isRejectLike(text)) return false;
  const t = text.toLowerCase();
  return (
    t.includes("allow") ||
    t.includes("允许") ||
    t.includes("approve") ||
    t.includes("批准") ||
    t.includes("allow_always")
  );
}

/** Match name/kind containing always / 总是 / session. Returns optionId or null. */
export function findAlwaysOption(options: PermissionOption[]): string | null {
  for (const opt of options) {
    if (isAlwaysLike(optionText(opt))) return opt.optionId;
  }
  return null;
}

/** First option whose name/kind looks like allow (not reject/deny/cancel). */
export function pickAllowOption(options: PermissionOption[]): string | null {
  for (const opt of options) {
    if (isAllowLike(optionText(opt))) return opt.optionId;
  }
  return null;
}

/** Whether an option should render as primary (allow-like). */
export function isAllowOption(opt: PermissionOption): boolean {
  return isAllowLike(optionText(opt));
}
