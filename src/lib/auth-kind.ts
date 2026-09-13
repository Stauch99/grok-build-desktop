export type AuthKind = "subscription" | "api" | "none";

export type AuthEvidence = {
  hasSubscriptionSession: boolean;
  hasApiKey: boolean;
};

export function classifyAuthKind(evidence: AuthEvidence): AuthKind {
  if (evidence.hasApiKey) return "api";
  if (evidence.hasSubscriptionSession) return "subscription";
  return "none";
}

export function shouldShowUsageRing(kind: AuthKind): boolean {
  return kind === "subscription";
}

export function shouldPollBilling(kind: AuthKind): boolean {
  return shouldShowUsageRing(kind);
}
