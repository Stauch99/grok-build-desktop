export type LspBarProps = {
  servers: unknown[];
};

function lspName(row: unknown, i: number): string {
  if (row && typeof row === "object") {
    const rec = row as Record<string, unknown>;
    const name = rec.name ?? rec.id ?? rec.language;
    if (typeof name === "string" && name.trim()) return name;
  }
  if (typeof row === "string" && row.trim()) return row;
  return `lsp-${i + 1}`;
}

/**
 * Read-only LSP inventory from inspect. Desktop does not start language servers.
 */
export function LspBar({ servers }: LspBarProps) {
  if (servers.length === 0) return null;
  return (
    <p className="sandbox-bar" role="status" aria-label="LSP">
      LSP · {servers.map(lspName).join(" · ")}
    </p>
  );
}
