import { basename } from "../lib/text";
import { IconFinder } from "../icons";

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
  const label = basename(path) || path;

  return (
    <div className="hub-compose">
      {dirty ? <p className="hub-meta">未保存</p> : null}
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
          保存
        </button>
        <button type="button" className="file-open" onClick={onReveal} title="在访达中打开" aria-label="在访达中打开">
          <IconFinder size={14} />
        </button>
      </div>
    </div>
  );
}
