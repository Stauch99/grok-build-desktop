import { basename } from "../lib/text";
import { IconFinder } from "../icons";
import { useT } from "../lib/locale-context";

export type MemoryEditorProps = {
  path: string;
  text: string;
  dirty?: boolean;
  onChange: (t: string) => void;
  onSave: () => void;
  onReveal: () => void;
};

/** Light textarea editor for MEMORY.md / AGENTS.md. */
export function MemoryEditor({
  path,
  text,
  dirty,
  onChange,
  onSave,
  onReveal,
}: MemoryEditorProps) {
  const t = useT();
  const label = basename(path) || path;

  return (
    <div className="hub-compose">
      {dirty ? <p className="hub-meta">{t("memory.unsaved")}</p> : null}
      <textarea
        className="hub-preview"
        value={text}
        rows={14}
        spellCheck={false}
        aria-label={label}
        onChange={(e) => onChange(e.target.value)}
        onKeyDown={(e) => {
          if ((e.metaKey || e.ctrlKey) && e.key === "s") {
            e.preventDefault();
            onSave();
          }
        }}
      />
      <div className="set-actions">
        <button type="button" className="btn" onClick={onSave} disabled={dirty === false}>
          {t("preview.save")}
        </button>
        <button type="button" className="file-open" onClick={onReveal} aria-label={t("finder.open")}>
          <IconFinder size={14} />
        </button>
      </div>
    </div>
  );
}
