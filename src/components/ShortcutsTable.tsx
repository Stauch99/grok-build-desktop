import {
  bindingFor,
  DEFAULT_SHORTCUTS,
  eventToBinding,
  shortcutConflictIds,
} from "../lib/shortcuts-table";
import { useT } from "../lib/locale-context";

export type ShortcutsTableProps = {
  overrides: Record<string, string>;
  onChange: (id: string, binding: string) => void;
};

/**
 * Action bindings from DEFAULT_SHORTCUTS. Send-key stays in Settings chat.
 * Focus a row and press the chord to record it.
 */
export function ShortcutsTable({ overrides, onChange }: ShortcutsTableProps) {
  const t = useT();
  const conflicts = shortcutConflictIds(overrides);

  return (
    <table className="shortcut-table">
      <thead>
        <tr>
          <th>{t("shortcut.action")}</th>
          <th>{t("shortcut.binding")}</th>
        </tr>
      </thead>
      <tbody>
        {DEFAULT_SHORTCUTS.map((row) => (
          <tr key={row.id} className={conflicts.includes(row.id) ? "is-conflict" : undefined}>
            <td>
              <label htmlFor={`shortcut-${row.id}`}>{t(row.action)}</label>
            </td>
            <td>
              <input
                id={`shortcut-${row.id}`}
                readOnly
                value={bindingFor(overrides, row.id)}
                placeholder={t("shortcut.recordHint")}
                aria-label={t(row.action)}
                aria-invalid={conflicts.includes(row.id) || undefined}
                aria-describedby={conflicts.includes(row.id) ? `shortcut-conflict-${row.id}` : undefined}
                onKeyDown={(e) => {
                  if (e.key === "Tab") return;
                  e.preventDefault();
                  if (e.key === "Escape" || e.key === "Backspace") {
                    onChange(row.id, "");
                    return;
                  }
                  const spec = eventToBinding(e);
                  if (spec) onChange(row.id, spec);
                }}
              />
              {conflicts.includes(row.id) ? (
                <span id={`shortcut-conflict-${row.id}`} className="shortcut-conflict">
                  {t("shortcut.conflict")}
                </span>
              ) : null}
            </td>
          </tr>
        ))}
      </tbody>
    </table>
  );
}
