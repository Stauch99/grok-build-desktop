import { startAgent, stopAgent, sendRaw } from "../api";
import { tr } from "./i18n-bridge";
import type { AgentDoctor } from "./agent-doctor";
import type { AgentId } from "./agent-id";
import type { AuthKind } from "./auth-kind";

export type AgentPort = {
  id: AgentId;
  start: () => Promise<void>;
  stop: () => Promise<void>;
  send: (payload: unknown) => Promise<unknown>;
};

export function portFor(id: AgentId): AgentPort {
  return {
    id,
    start: async () => {
      await startAgent(id);
    },
    stop: async () => {
      await stopAgent(id);
    },
    send: (p) => sendRaw(p as never, id),
  };
}

export function billingKindFromDoctors(
  doctors: Pick<AgentDoctor, "agentId" | "authKind">[],
  selected: AgentId,
): AuthKind {
  const match = doctors.find((d) => d.agentId === selected);
  return match?.authKind ?? "none";
}

export function doctorOverviewLine(
  d: Pick<AgentDoctor, "agentId" | "authKind" | "binary" | "version" | "spawnRejected">,
): string {
  if (d.spawnRejected) return `${d.agentId} · ${tr("doctor.rejected")}`;
  if (!d.binary) return `${d.agentId} · ${tr("doctor.missing")}`;
  const suffix =
    d.authKind === "none" ? tr("doctor.signedOut") : d.authKind === "api" ? "API" : tr("doctor.signedIn");
  const bits = [`${d.agentId} · ${suffix}`];
  if (d.version) bits.push(d.version);
  bits.push(d.binary);
  return bits.join(" · ");
}
