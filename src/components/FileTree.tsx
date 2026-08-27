export type FileTreeNode = { name: string; path: string; kind: "file" | "dir" };

export type FileTreeProps = {
  nodes: FileTreeNode[];
  query: string;
  onQuery: (q: string) => void;
  onPreview: (path: string) => void;
  onAddToChat: (path: string) => void;
  onReveal?: () => void;
};

function asMention(path: string): string {
  return path.startsWith("@") ? path : `@${path}`;
}

/**
 * Searchable workspace list. Click a row to preview;「加入对话」inserts `@path`.
 */
export function FileTree({ nodes, query, onQuery, onPreview, onAddToChat, onReveal }: FileTreeProps) {
  const q = query.trim().toLowerCase();
  const visible = q
    ? nodes.filter(
        (n) => n.name.toLowerCase().includes(q) || n.path.toLowerCase().includes(q),
      )
    : nodes;
  const dirs = visible.filter((n) => n.kind === "dir");
  const files = visible.filter((n) => n.kind === "file");

  const renderRow = (node: FileTreeNode) => (
    <div className="file-row" key={node.path}>
      <button
        type="button"
        className="file-item"
        title={node.path}
        onClick={() => onPreview(node.path)}
      >
        {node.name}
      </button>
      <button
        type="button"
        className="btn ghost"
        title="加入对话"
        onClick={() => onAddToChat(asMention(node.path))}
      >
        @
      </button>
    </div>
  );

  return (
    <section>
      <input
        className="hub-search"
        value={query}
        placeholder="搜索文件"
        aria-label="搜索文件"
        onChange={(e) => onQuery(e.target.value)}
      />
      {visible.length === 0 ? (
        <div>
          <p className="float-empty">
            {q ? "没有匹配的文件。换一个词，或清空搜索。" : "工作区还没有可列出的文件。"}
          </p>
          {!q && onReveal ? (
            <div className="set-actions">
              <button type="button" className="btn ghost" onClick={onReveal}>
                在访达打开
              </button>
            </div>
          ) : null}
        </div>
      ) : (
        <div className="file-list">
          {dirs.length > 0 ? <div className="file-folder">文件夹</div> : null}
          {dirs.map(renderRow)}
          {files.length > 0 ? <div className="file-folder">文件</div> : null}
          {files.map(renderRow)}
        </div>
      )}
    </section>
  );
}
