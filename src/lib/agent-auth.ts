import type { AgentId } from "./agent-id";
import { classifyAuthKind, type AuthEvidence } from "./auth-kind";
import { emptyDoctor, type AgentDoctor } from "./agent-doctor";

function keyOn(v?: string | null): boolean {
  return Boolean(v?.trim());
}

export function grokAuthEvidence(input: { authJsonExists: boolean; apiKey?: string | null }): AuthEvidence {
  return { hasSubscriptionSession: input.authJsonExists, hasApiKey: keyOn(input.apiKey) };
}

export function kimiAuthEvidence(input: { loginExists: boolean; apiKey?: string | null }): AuthEvidence {
  return { hasSubscriptionSession: input.loginExists, hasApiKey: keyOn(input.apiKey) };
}

export function claudeAuthEvidence(input: { oauthSession: boolean; anthropicApiKey?: string | null }): AuthEvidence {
  return { hasSubscriptionSession: input.oauthSession, hasApiKey: keyOn(input.anthropicApiKey) };
}

export function codexAuthEvidence(input: {
  chatgptLogin: boolean;
  openaiApiKey?: string | null;
  codexApiKey?: string | null;
}): AuthEvidence {
  return {
    hasSubscriptionSession: input.chatgptLogin,
    hasApiKey: keyOn(input.openaiApiKey) || keyOn(input.codexApiKey),
  };
}

export function doctorFromEvidence(
  id: AgentId,
  userHome: string,
  evidence: AuthEvidence,
  extra?: { binary?: string | null; version?: string | null },
): AgentDoctor {
  const base = emptyDoctor(id, userHome);
  return {
    ...base,
    authPresent: evidence.hasSubscriptionSession || evidence.hasApiKey,
    authKind: classifyAuthKind(evidence),
    binary: extra?.binary ?? base.binary,
    version: extra?.version ?? base.version,
  };
}
