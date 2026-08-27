import type { McpInheritance, SubagentStatus } from "../lib/subagent";

export type SubagentCardProps = {
  name: string;
  status: SubagentStatus;
  summary?: string;
  mcpInheritance?: McpInheritance;
  onOpen?: () => void;
};

const STATUS_LABEL: Record<SubagentStatus, string> = {
  running: "运行中",
  completed: "已完成",
  cancelled: "已取消",
  failed: "失败",
};

const DOT: Record<SubagentStatus, string> = {
  running: "status-dot on",
  completed: "status-dot on",
  cancelled: "status-dot",
  failed: "status-dot wait",
};

/**
 * One spawned subagent: status, optional MCP inheritance, optional open.
 */
export function SubagentCard({ name, status, summary, mcpInheritance, onOpen }: SubagentCardProps) {
  return (
    <div className="hub-row">
      <button type="button" className="hub-row-main" onClick={onOpen}>
        <strong>{name}</strong>
        <span className="hub-meta">
          {STATUS_LABEL[status]}
          {mcpInheritance ? ` · ${mcpInheritance === "inherit" ? "继承 MCP" : "无 MCP"}` : ""}
          {summary ? ` · ${summary}` : ""}
        </span>
      </button>
      <span className={DOT[status]} title={STATUS_LABEL[status]} aria-label={STATUS_LABEL[status]} />
    </div>
  );
}
