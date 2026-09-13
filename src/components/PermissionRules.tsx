import { parsePermissionRules } from "../lib/permission-toml";
import { useT } from "../lib/locale-context";

export type PermissionRulesProps = {
  text?: string;
};

/**
 * Visualize allow / deny from permission.toml text. Read-only.
 */
export function PermissionRules({ text }: PermissionRulesProps) {
  const t = useT();
  const rules = parsePermissionRules(text ?? "");
  const empty = rules.allow.length === 0 && rules.deny.length === 0;
  if (empty) return null;

  return (
    <section>
      <h3>{t("perm.rules")}</h3>
      <div className="perm-rules">
        {rules.allow.length > 0 ? (
          <div>
            <div className="file-folder">{t("perm.allowList")}</div>
            <ul>
              {rules.allow.map((r) => (
                <li key={`a-${r}`}>{r}</li>
              ))}
            </ul>
          </div>
        ) : null}
        {rules.deny.length > 0 ? (
          <div>
            <div className="file-folder">{t("perm.denyList")}</div>
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
