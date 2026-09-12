import { useT } from "../lib/locale-context";

export type ManagedConfigViewProps = {
  path: string;
  text: string;
  exists: boolean;
};

/**
 * Read-only managed_config / requirements.toml. No edit surface here.
 */
export function ManagedConfigView({ path, text, exists }: ManagedConfigViewProps) {
  const t = useT();
  return (
    <div>
      <h3>managed_config</h3>
      {exists ? (
        <pre className="hub-preview" aria-label={path}>
          {text || t("managed.emptyText")}
        </pre>
      ) : (
        <p className="float-empty">{t("managed.missing")}</p>
      )}
    </div>
  );
}
