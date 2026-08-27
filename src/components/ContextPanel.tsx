import type { PlanFile, RuleFile } from "../api";

export type ContextPanelProps = {
  planFile: PlanFile | null;
  rules: RuleFile[];
  onOpen: (path: string) => void;
  mcpEnabled?: number;
};

const SCOPE_LABEL: Record<string, string> = {
  project: "本项目",
  parent: "上级目录",
  home: "用户目录",
};

function scopeLabel(scope: string): string {
  return SCOPE_LABEL[scope] ?? "其他";
}

function planPreview(text: string): string {
  const line = text.split(/\r?\n/).find((l) => l.trim())?.trim() ?? "";
  return line.length > 80 ? `${line.slice(0, 80)}…` : line;
}

function groupRules(rules: RuleFile[]): Array<{ scope: string; label: string; items: RuleFile[] }> {
  const order = ["project", "parent", "home"];
  const buckets = new Map<string, RuleFile[]>();

  for (const rule of rules) {
    const key = order.includes(rule.scope) ? rule.scope : "other";
    const list = buckets.get(key) ?? [];
    list.push(rule);
    buckets.set(key, list);
  }

  const groups: Array<{ scope: string; label: string; items: RuleFile[] }> = [];
  for (const scope of order) {
    const items = buckets.get(scope);
    if (items?.length) groups.push({ scope, label: scopeLabel(scope), items });
  }
  const other = buckets.get("other");
  if (other?.length) groups.push({ scope: "other", label: scopeLabel("other"), items: other });

  return groups;
}

/**
 * Session plan.md plus AGENTS.md / CLAUDE.md rules for the float card context tab.
 * Data is passed in by App — no fetching here.
 */
export function ContextPanel({ planFile, rules, onOpen, mcpEnabled }: ContextPanelProps) {
  const ruleGroups = groupRules(rules);

  return (
    <>
      {typeof mcpEnabled === "number" && (
        <p className="hint" aria-label={`已启用 MCP ${mcpEnabled}`}>
          已启用 MCP {mcpEnabled}
        </p>
      )}
      <h3>会话计划</h3>
      {planFile ? (
        <button type="button" className="file-item ctx-plan" onClick={() => onOpen(planFile.path)}>
          <span className="ctx-plan-name">plan.md</span>
          <span className="ctx-plan-preview">{planPreview(planFile.text)}</span>
        </button>
      ) : (
        <p className="float-empty">本会话还没有 plan.md</p>
      )}

      <h3>规则</h3>
      {rules.length === 0 ? (
        <p className="float-empty">当前目录没有 AGENTS.md / CLAUDE.md</p>
      ) : (
        ruleGroups.map((group) => (
          <div key={group.scope} className="ctx-group">
            <div className="file-folder">{group.label}</div>
            <div className="file-list">
              {group.items.map((rule) => (
                <button
                  key={rule.path}
                  type="button"
                  className="file-item"
                  title={rule.path}
                  onClick={() => onOpen(rule.path)}
                >
                  {rule.name}
                  <span className="ctx-dir"> {rule.dir}</span>
                </button>
              ))}
            </div>
          </div>
        ))
      )}
    </>
  );
}
