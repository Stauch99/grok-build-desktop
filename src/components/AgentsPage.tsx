import { useT } from "../lib/locale-context";

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
  const t = useT();
  const agentRows = agents.filter((a) => a.kind === "agent");
  const personaRows = agents.filter((a) => a.kind === "persona");
  const empty = agentRows.length === 0 && personaRows.length === 0;

  return (
    <div>
      {empty ? <p className="float-empty">{t("agents.empty")}</p> : null}
      <AgentList title={t("extra.agents")} items={agentRows} onOpen={onOpen} />
      <AgentList title={t("agents.personas")} items={personaRows} onOpen={onOpen} />
      <p className="hub-meta">{t("agents.hint")}</p>
    </div>
  );
}
