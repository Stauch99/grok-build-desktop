import { bindingFor, DEFAULT_SHORTCUTS } from "../lib/shortcuts-table";

export type ShortcutsTableProps = {
  overrides: Record<string, string>;
  onChange: (id: string, binding: string) => void;
};

/**
 * Action bindings from DEFAULT_SHORTCUTS. Send-key stays in Settings chat.
 */
export function ShortcutsTable({ overrides, onChange }: ShortcutsTableProps) {
  return (
    <table className="shortcut-table">
      <thead>
        <tr>
          <th>动作</th>
          <th>绑定</th>
        </tr>
      </thead>
      <tbody>
        {DEFAULT_SHORTCUTS.map((row) => (
          <tr key={row.id}>
            <td>
              <label htmlFor={`shortcut-${row.id}`}>{row.action}</label>
            </td>
            <td>
              <input
                id={`shortcut-${row.id}`}
                value={bindingFor(overrides, row.id)}
                onChange={(e) => onChange(row.id, e.target.value)}
                aria-label={row.action}
              />
            </td>
          </tr>
        ))}
      </tbody>
    </table>
  );
}
