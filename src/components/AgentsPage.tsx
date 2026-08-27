export type AgentEntry = {
  name: string;
  path: string;
  kind: "agent" | "persona";
};

export type AgentsPageProps = {
  agents: AgentEntry[];
  onOpen: (path: string) => void;
  onSlash?: (cmd: string) => void;
};

function AgentList({
  title,
  items,
  onOpen,
}: {
  title: string;
  items: AgentEntry[];
  onOpen: (path: string) => void;
}) {
  if (items.length === 0) return null;
  return (
    <section>
      <h3>{title}</h3>
      <div className="file-list">
        {items.map((a) => (
          <button
            key={a.path}
            type="button"
            className="file-item"
            title={a.path}
            onClick={() => onOpen(a.path)}
          >
            {a.name}
          </button>
        ))}
      </div>
    </section>
  );
}

/**
 * ~/.grok/agents and personas. Management stays on the CLI slash command.
 */
export function AgentsPage({ agents, onOpen, onSlash }: AgentsPageProps) {
  const agentRows = agents.filter((a) => a.kind === "agent");
  const personaRows = agents.filter((a) => a.kind === "persona");
  const empty = agentRows.length === 0 && personaRows.length === 0;

  return (
    <div>
      {empty ? <p className="float-empty">还没有代理或人格。</p> : null}
      <AgentList title="代理" items={agentRows} onOpen={onOpen} />
      <AgentList title="人格" items={personaRows} onOpen={onOpen} />
      {onSlash ? (
        <div className="set-actions">
          <button type="button" className="btn ghost" onClick={() => onSlash("/config-agents")}>
            用 /config-agents 管理
          </button>
        </div>
      ) : null}
    </div>
  );
}
