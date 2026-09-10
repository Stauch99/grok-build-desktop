import { AGENT_IDS, type AgentId } from "../lib/agent-id";
import { agentChipClassName, agentChipDisabled, agentChipLabel } from "../lib/agent-chip";
import { AgentIcon } from "../lib/agent-icons";
import { nextSelectedAgent } from "../lib/session-agent";
import { useT } from "../lib/locale-context";
import { IconCheck, IconChevron } from "../icons";

export type AgentChipProps = {
  hasOpenSession: boolean;
  value: AgentId;
  onChange: (next: AgentId) => void;
  open: boolean;
  onToggle: () => void;
};

export function AgentChip({ hasOpenSession, value, onChange, open, onToggle }: AgentChipProps) {
  const t = useT();
  const disabled = agentChipDisabled(hasOpenSession);

  return (
    <div className="chip-wrap">
      <button
        type="button"
        className={agentChipClassName(value, value)}
        aria-label={`${t("agent.switchCli")}: ${agentChipLabel(value)}`}
        aria-haspopup="menu"
        aria-expanded={open}
        disabled={disabled}
        onClick={() => {
          if (disabled) return;
          onToggle();
        }}
      >
        <AgentIcon id={value} size={14} />
        <IconChevron size={11} />
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
                <span className="agent-menu-item">
                  <AgentIcon id={id} size={14} />
                  {agentChipLabel(id)}
                </span>
                <span>{id === value ? <IconCheck size={12} /> : null}</span>
              </span>
            </button>
          ))}
        </div>
      )}
    </div>
  );
}
