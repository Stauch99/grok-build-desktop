import type { AgentId } from "./agent-id";

export const DEVIN_AUTH_METHOD = "devin-browser";

export type DevinAuthStatus = "idle" | "checking" | "needed" | "busy" | "ok" | "failed";

/**
 * The Devin ACP `authenticate` request. `_meta.api_key` selects server-side key
 * validation; without it the CLI starts the PKCE browser flow (no immediate
 * response — the request stays pending until sign-in completes).
 */
export function buildDevinAuthenticate(apiKey?: string): {
  method: string;
  params: Record<string, unknown>;
} {
  const key = apiKey?.trim();
  return {
    method: "authenticate",
    params: key
      ? { methodId: DEVIN_AUTH_METHOD, _meta: { api_key: key } }
      : { methodId: DEVIN_AUTH_METHOD },
  };
}

type ErrorLike = { code?: unknown; message?: unknown };

function errorRecord(e: unknown): ErrorLike | null {
  if (!e || typeof e !== "object") return null;
  const inner = (e as { error?: unknown }).error;
  if (inner && typeof inner === "object") return inner as ErrorLike;
  return e as ErrorLike;
}

/**
 * Devin rejects session/new|load|resume with -32000 "ACP host has not
 * authenticated …" until `authenticate` succeeds. Kept tight on purpose —
 * generic "Authentication required" copy from other agents must not match.
 */
export function isAcpAuthRequiredError(e: unknown): boolean {
  const rec = errorRecord(e);
  if (
    rec &&
    rec.code === -32000 &&
    typeof rec.message === "string" &&
    /authenticat/i.test(rec.message)
  ) {
    return true;
  }
  const msg = e instanceof Error ? e.message : "";
  return /not authenticated/i.test(msg);
}

/** The card is only actionable while a devin auth flow is up or required. */
export function shouldShowDevinAuthCard(
  agentId: AgentId | string | null | undefined,
  status: DevinAuthStatus,
): boolean {
  return agentId === "devin" && (status === "needed" || status === "busy" || status === "failed");
}
