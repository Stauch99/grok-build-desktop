/** In-memory session tool allowlist key: `${sessionId}::${toolName}`. */
export type AllowKey = `${string}::${string}`;

/** Durable grants expire; session allow-list does not. */
export const GRANT_TTL_MS = 7 * 24 * 60 * 60 * 1000;
const GRANT_TS_SEP = "@@";

const HIGH_RISK_TOOLS = new Set(["execute", "bash", "write", "shell"]);

/** High-risk tools cannot be saved as durable "always" grants. Session skip and yolo stay. */
export function isHighRiskTool(toolName: string): boolean {
  const n = toolName.trim().toLowerCase().replace(/:$/, "");
  return HIGH_RISK_TOOLS.has(n);
}

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
  const bare = grantBareKey(key);
  const parts = bare.split("::");
  if (parts.length < 3) return null;
  const agentId = parts[0] ?? "";
  const tool = parts[parts.length - 1] ?? "";
  const cwd = parts.slice(1, -1).join("::");
  if (!agentId || !cwd || !tool) return null;
  return { agentId, cwd, tool };
}

function grantBareKey(entry: string): string {
  const cut = entry.lastIndexOf(GRANT_TS_SEP);
  return cut === -1 ? entry : entry.slice(0, cut);
}

export function grantGrantedAt(entry: string): number | null {
  const cut = entry.lastIndexOf(GRANT_TS_SEP);
  if (cut === -1) return null;
  const n = Number(entry.slice(cut + GRANT_TS_SEP.length));
  return Number.isFinite(n) && n > 0 ? n : null;
}

export function storedGrant(agentId: string, cwd: string, toolName: string, grantedAt = Date.now()): string {
  return `${grantKey(agentId, cwd, toolName)}${GRANT_TS_SEP}${grantedAt}`;
}

export function grantExpiresAt(entry: string, ttlMs = GRANT_TTL_MS): number | null {
  const at = grantGrantedAt(entry);
  return at == null ? null : at + ttlMs;
}

export function grantStillValid(entry: string, nowMs = Date.now(), ttlMs = GRANT_TTL_MS): boolean {
  if (isHighRiskTool(parseGrantKey(entry)?.tool ?? "")) return false;
  const at = grantGrantedAt(entry);
  if (at == null) return false;
  return nowMs - at < ttlMs;
}

/** Stamp legacy keys, drop expired and high-risk durable grants. */
export function migrateAllowedTools(entries: readonly string[], nowMs = Date.now()): string[] {
  const out: string[] = [];
  const seen = new Set<string>();
  for (const raw of entries) {
    if (typeof raw !== "string" || !raw) continue;
    if (!raw.includes("::")) continue;
    const parsed = parseGrantKey(raw);
    if (parsed) {
      if (isHighRiskTool(parsed.tool)) continue;
      const stamped = grantGrantedAt(raw) != null ? raw : storedGrant(parsed.agentId, parsed.cwd, parsed.tool, nowMs);
      if (!grantStillValid(stamped, nowMs)) continue;
      const bare = grantBareKey(stamped);
      if (seen.has(bare)) continue;
      seen.add(bare);
      out.push(stamped);
      continue;
    }
    // session allow keys (`sessionId::tool`) — keep as-is
    if (raw.includes(GRANT_TS_SEP)) continue;
    if (seen.has(raw)) continue;
    seen.add(raw);
    out.push(raw);
  }
  return out;
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
  nowMs = Date.now(),
): boolean {
  if (!toolName) return false;
  if (grant?.agentId && grant.cwd && hasValidDurableGrant(allowed, grant.agentId, grant.cwd, toolName, nowMs)) {
    return true;
  }
  if (!sessionId) return false;
  return allowed.has(allowKey(sessionId, toolName));
}

function hasValidDurableGrant(
  allowed: Set<string>,
  agentId: string,
  cwd: string,
  toolName: string,
  nowMs: number,
): boolean {
  if (isHighRiskTool(toolName)) return false;
  const exact = grantKey(agentId, cwd, toolName);
  for (const entry of allowed) {
    if (grantBareKey(entry) !== exact) continue;
    if (grantStillValid(entry, nowMs)) return true;
  }
  return false;
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
  grantedAt = Date.now(),
): Set<string> {
  const next = new Set(allowed);
  if (!agentId || !cwd || !toolName || isHighRiskTool(toolName)) return next;
  const exact = grantKey(agentId, cwd, toolName);
  for (const entry of [...next]) {
    if (grantBareKey(entry) === exact) next.delete(entry);
  }
  next.add(storedGrant(agentId, cwd, toolName, grantedAt));
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
