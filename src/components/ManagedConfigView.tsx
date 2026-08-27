export type ManagedConfigViewProps = {
  path: string;
  text: string;
  exists: boolean;
};

/**
 * Read-only managed_config / requirements.toml. No edit surface here.
 */
export function ManagedConfigView({ path, text, exists }: ManagedConfigViewProps) {
  return (
    <div>
      <h3>managed_config</h3>
      {exists ? (
        <pre className="hub-preview" title={path}>
          {text || "（空）"}
        </pre>
      ) : (
        <p className="float-empty">没有 managed_config</p>
      )}
    </div>
  );
}
