import { useT } from "../lib/locale-context";

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
 * Searchable workspace list. Click a row to preview; join-chat inserts `@path`.
 */
export function FileTree({ nodes, query, onQuery, onPreview, onAddToChat, onReveal }: FileTreeProps) {
  const t = useT();
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
        data-tip={node.path}
        onClick={() => onPreview(node.path)}
      >
        {node.name}
      </button>
      <button
        type="button"
        className="btn ghost"
        data-tip={t("file.joinChat")}
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
        placeholder={t("file.search")}
        aria-label={t("file.search")}
        onChange={(e) => onQuery(e.target.value)}
      />
      {visible.length === 0 ? (
        <div>
          <p className="float-empty">
            {q ? t("file.noMatch") : t("explorer.noFiles")}
          </p>
          {!q && onReveal ? (
            <div className="set-actions">
              <button type="button" className="btn ghost" onClick={onReveal}>
                {t("hub.openFinder")}
              </button>
            </div>
          ) : null}
        </div>
      ) : (
        <div className="file-list">
          {dirs.length > 0 ? <div className="file-folder">{t("file.folders")}</div> : null}
          {dirs.map(renderRow)}
          {files.length > 0 ? <div className="file-folder">{t("file.files")}</div> : null}
          {files.map(renderRow)}
        </div>
      )}
    </section>
  );
}
