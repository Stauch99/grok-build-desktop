import { basename } from "../lib/text";

export type SpillListProps = {
  paths: string[];
  onOpen: (path: string) => void;
};

/**
 * Session MCP spill files after truncated tool output.
 */
export function SpillList({ paths, onOpen }: SpillListProps) {
  if (paths.length === 0) return null;
  return (
    <section>
      <h3>溢出</h3>
      <div className="file-list">
        {paths.map((p) => (
          <button key={p} type="button" className="file-item" title={p} onClick={() => onOpen(p)}>
            {basename(p)}
          </button>
        ))}
      </div>
    </section>
  );
}
