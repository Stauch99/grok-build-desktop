import type { CommandDef } from "../lib/commands";
import { commandGroup } from "../lib/slash-groups";

export type SlashMenuProps = {
  open: boolean;
  items: CommandDef[];
  active: number;
  onPick: (cmd: CommandDef) => void;
};

export function SlashMenu({ open, items, active, onPick }: SlashMenuProps) {
  if (!open || items.length === 0) return null;

  return (
    <div className="mention" role="listbox" aria-label="斜杠命令">
      {items.map((c, i) => {
        const group = commandGroup(c);
        return (
          <button
            key={c.name}
            type="button"
            role="option"
            aria-selected={i === active}
            onClick={() => onPick(c)}
          >
            <strong>{c.name}</strong>
            <span className="mention-hint">{c.hint}</span>
            <span className={`slash-badge slash-badge-${group}`}>{group}</span>
          </button>
        );
      })}
    </div>
  );
}
