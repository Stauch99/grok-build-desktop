import type { PlanFile, RuleFile } from "../api";
import { useT } from "../lib/locale-context";

export type ContextPanelProps = {
  planFile: PlanFile | null;
  rules: RuleFile[];
  onOpen: (path: string) => void;
  mcpEnabled?: number;
};

function scopeKey(scope: string): string {
  if (scope === "project") return "context.project";
  if (scope === "parent") return "context.parent";
  if (scope === "home") return "context.home";
  return "context.other";
}

function planPreview(text: string): string {
  const line = text.split(/\r?\n/).find((l) => l.trim())?.trim() ?? "";
  return line.length > 80 ? `${line.slice(0, 80)}…` : line;
}

function groupRules(rules: RuleFile[]): Array<{ scope: string; items: RuleFile[] }> {
  const order = ["project", "parent", "home"];
  const buckets = new Map<string, RuleFile[]>();

  for (const rule of rules) {
    const key = order.includes(rule.scope) ? rule.scope : "other";
    const list = buckets.get(key) ?? [];
    list.push(rule);
    buckets.set(key, list);
  }

  const groups: Array<{ scope: string; items: RuleFile[] }> = [];
  for (const scope of order) {
    const items = buckets.get(scope);
    if (items?.length) groups.push({ scope, items });
  }
  const other = buckets.get("other");
  if (other?.length) groups.push({ scope: "other", items: other });

  return groups;
}

/**
 * Session plan.md plus AGENTS.md / CLAUDE.md rules for the float card context tab.
 * Data is passed in by App — no fetching here.
 */
export function ContextPanel({ planFile, rules, onOpen, mcpEnabled }: ContextPanelProps) {
  const t = useT();
  const ruleGroups = groupRules(rules);

  return (
    <>
      {typeof mcpEnabled === "number" && (
        <p className="hint" aria-label={t("context.mcpEnabled", { n: mcpEnabled })}>
          {t("context.mcpEnabled", { n: mcpEnabled })}
        </p>
      )}
      <h3>{t("context.plan")}</h3>
      {planFile ? (
        <button type="button" className="file-item ctx-plan" onClick={() => onOpen(planFile.path)}>
          <span className="ctx-plan-name">plan.md</span>
          <span className="ctx-plan-preview">{planPreview(planFile.text)}</span>
        </button>
      ) : (
        <p className="float-empty">{t("context.noPlan")}</p>
      )}

      <h3>{t("context.rules")}</h3>
      {rules.length === 0 ? (
        <p className="float-empty">{t("context.noRules")}</p>
      ) : (
        ruleGroups.map((group) => (
          <div key={group.scope} className="ctx-group">
            <div className="file-folder">{t(scopeKey(group.scope))}</div>
            <div className="file-list">
              {group.items.map((rule) => (
                <button
                  key={rule.path}
                  type="button"
                  className="file-item"
                  data-tip={rule.path}
                  onClick={() => onOpen(rule.path)}
                >
                  {rule.name}
                </button>
              ))}
            </div>
          </div>
        ))
      )}
    </>
  );
}
