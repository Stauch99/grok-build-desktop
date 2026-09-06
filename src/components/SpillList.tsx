import { basename } from "../lib/text";
import { useT } from "../lib/locale-context";

export type SpillListProps = {
  paths: string[];
  onOpen: (path: string) => void;
};

/**
 * Session MCP spill files after truncated tool output.
 */
export function SpillList({ paths, onOpen }: SpillListProps) {
  const t = useT();
  if (paths.length === 0) return null;
  return (
    <section>
      <h3>{t("spill.title")}</h3>
      <div className="file-list">
        {paths.map((p) => (
          <button key={p} type="button" className="file-item" data-tip={p} onClick={() => onOpen(p)}>
            {basename(p)}
          </button>
        ))}
      </div>
    </section>
  );
}
