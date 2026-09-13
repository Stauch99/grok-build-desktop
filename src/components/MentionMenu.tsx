import type { MentionHit } from "../lib/mentions";
import { useT } from "../lib/locale-context";

export type MentionMenuProps = {
  open: boolean;
  items: MentionHit[];
  active: number;
  onPick: (hit: MentionHit) => void;
  onHover: (index: number) => void;
  includeContent?: boolean;
  onIncludeContent?: (next: boolean) => void;
};

function mentionGroupHint(
  group: MentionHit["group"],
  t: (key: string) => string,
): string | undefined {
  if (group === "dir") return t("mention.dir");
  if (group === "change") return t("mention.change");
  return undefined;
}

export function MentionMenu({
  open,
  items,
  active,
  onPick,
  onHover,
  includeContent = false,
  onIncludeContent,
}: MentionMenuProps) {
  const t = useT();
  if (!open || items.length === 0) return null;

  return (
    <div className="mention">
      {onIncludeContent ? (
        <label
          className="mention-hint"
          style={{ display: "flex", alignItems: "center", gap: 6, margin: "4px 10px 6px 10px" }}
          onMouseDown={(e) => e.preventDefault()}
        >
          <input
            type="checkbox"
            checked={includeContent}
            onChange={(e) => onIncludeContent(e.target.checked)}
          />
          {t("mention.include")}
        </label>
      ) : null}
      <div role="listbox" aria-label={t("mention.list")}>
        {items.slice(0, 12).map((hit, i) => {
          const hint = mentionGroupHint(hit.group, t);
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
    </div>
  );
}
