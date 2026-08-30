import { AGENT_IDS, type AgentId } from "../lib/agent-id";
import { agentChipClassName, agentChipDisabled, agentChipLabel } from "../lib/agent-chip";
import { nextSelectedAgent } from "../lib/session-agent";

export type AgentChipProps = {
  hasOpenSession: boolean;
  value: AgentId;
  onChange: (next: AgentId) => void;
};

export function AgentChip({ hasOpenSession, value, onChange }: AgentChipProps) {
  const disabled = agentChipDisabled(hasOpenSession);

  return (
    <div className="agent-chip-row" role="group" aria-label="Agent">
      {AGENT_IDS.map((id) => (
        <button
          key={id}
          type="button"
          className={agentChipClassName(id, value)}
          aria-pressed={id === value}
          disabled={disabled}
          onClick={() => onChange(nextSelectedAgent(hasOpenSession, value, id))}
        >
          {agentChipLabel(id)}
        </button>
      ))}
    </div>
  );
}
