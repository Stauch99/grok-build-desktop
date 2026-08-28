import type { MentionHit } from "../lib/mentions";

export type MentionMenuProps = {
  open: boolean;
  items: MentionHit[];
  active: number;
  onPick: (hit: MentionHit) => void;
  onHover: (index: number) => void;
};

function mentionGroupHint(group: MentionHit["group"]): string | undefined {
  if (group === "dir") return "文件夹";
  if (group === "change") return "改动";
  return undefined;
}

export function MentionMenu({ open, items, active, onPick, onHover }: MentionMenuProps) {
  if (!open || items.length === 0) return null;

  return (
    <div className="mention" role="listbox" aria-label="提及">
      {items.slice(0, 12).map((hit, i) => {
        const hint = mentionGroupHint(hit.group);
        return (
          <button
            key={hit.id}
            type="button"
            role="option"
            aria-selected={i === active}
            onMouseEnter={() => onHover(i)}
            onClick={() => onPick(hit)}
          >
            {hit.label}
            {hint ? <span className="mention-hint">{hint}</span> : null}
          </button>
        );
      })}
    </div>
  );
}
