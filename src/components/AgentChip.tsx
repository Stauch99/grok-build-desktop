import { AGENT_IDS, type AgentId } from "../lib/agent-id";
import { agentChipClassName, agentChipDisabled, agentChipLabel } from "../lib/agent-chip";
import { nextSelectedAgent } from "../lib/session-agent";
import { IconCheck, IconChevron } from "../icons";

export type AgentChipProps = {
  hasOpenSession: boolean;
  value: AgentId;
  onChange: (next: AgentId) => void;
  open: boolean;
  onToggle: () => void;
};

export function AgentChip({ hasOpenSession, value, onChange, open, onToggle }: AgentChipProps) {
  const disabled = agentChipDisabled(hasOpenSession);

  return (
    <div className="chip-wrap">
      <button
        type="button"
        className={agentChipClassName(value, value)}
        aria-label="切换 CLI"
        aria-haspopup="menu"
        aria-expanded={open}
        title={agentChipLabel(value)}
        disabled={disabled}
        onClick={() => {
          if (disabled) return;
          onToggle();
        }}
      >
        {agentChipLabel(value)} <IconChevron size={11} />
      </button>
      {open && !disabled && (
        <div className="chip-menu agent-menu" role="menu">
          {AGENT_IDS.map((id) => (
            <button
              key={id}
              type="button"
              role="menuitemradio"
              aria-checked={id === value}
              onClick={() => onChange(nextSelectedAgent(hasOpenSession, value, id))}
            >
              <span className="mode-row">
                <span>{agentChipLabel(id)}</span>
                <span>{id === value ? <IconCheck size={12} /> : null}</span>
              </span>
            </button>
          ))}
        </div>
      )}
    </div>
  );
}
