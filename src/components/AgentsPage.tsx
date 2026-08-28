export type AgentEntry = {
  name: string;
  path: string;
  kind: "agent" | "persona";
};

export type AgentsPageProps = {
  agents: AgentEntry[];
  onOpen: (path: string) => void;
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
 * ~/.grok/agents and personas. Files open in the editor; this sheet is the manager.
 */
export function AgentsPage({ agents, onOpen }: AgentsPageProps) {
  const agentRows = agents.filter((a) => a.kind === "agent");
  const personaRows = agents.filter((a) => a.kind === "persona");
  const empty = agentRows.length === 0 && personaRows.length === 0;

  return (
    <div>
      {empty ? <p className="float-empty">还没有代理或人格。</p> : null}
      <AgentList title="代理" items={agentRows} onOpen={onOpen} />
      <AgentList title="人格" items={personaRows} onOpen={onOpen} />
      <p className="hub-meta">文件在 ~/.grok/agents 和 ~/.grok/personas。点名称可打开。</p>
    </div>
  );
}
