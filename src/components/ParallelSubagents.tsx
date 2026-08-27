export type ParallelSubagentItem = {
  id: string;
  name: string;
  status: string;
};

export type ParallelSubagentsProps = {
  items: ParallelSubagentItem[];
};

/**
 * Restrained list of parallel subagents. Status is passed in — desktop does
 * not spawn or steer them here.
 */
export function ParallelSubagents({ items }: ParallelSubagentsProps) {
  if (items.length === 0) return null;

  return (
    <section>
      <h3>子代理 · {items.length}</h3>
      <ul className="hub-rows">
        {items.map((item) => (
          <li key={item.id} className="hub-row">
            <div className="hub-row-main">
              <strong>{item.name}</strong>
              <span className="hub-meta">{item.status}</span>
            </div>
          </li>
        ))}
      </ul>
    </section>
  );
}
