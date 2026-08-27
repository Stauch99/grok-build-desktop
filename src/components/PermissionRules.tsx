import { parsePermissionRules } from "../lib/permission-toml";

export type PermissionRulesProps = {
  text?: string;
};

/**
 * Visualize allow / deny from permission.toml text. Read-only.
 */
export function PermissionRules({ text }: PermissionRulesProps) {
  const rules = parsePermissionRules(text ?? "");
  const empty = rules.allow.length === 0 && rules.deny.length === 0;
  if (empty) return null;

  return (
    <section>
      <h3>许可</h3>
      <div className="perm-rules">
        {rules.allow.length > 0 ? (
          <div>
            <div className="file-folder">允许</div>
            <ul>
              {rules.allow.map((r) => (
                <li key={`a-${r}`}>{r}</li>
              ))}
            </ul>
          </div>
        ) : null}
        {rules.deny.length > 0 ? (
          <div>
            <div className="file-folder">拒绝</div>
            <ul>
              {rules.deny.map((r) => (
                <li key={`d-${r}`}>{r}</li>
              ))}
            </ul>
          </div>
        ) : null}
      </div>
    </section>
  );
}
