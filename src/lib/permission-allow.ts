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
): boolean {
  if (!sessionId || !toolName) return false;
  return allowed.has(allowKey(sessionId, toolName));
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
