import { useMemo } from "react";
import { List, useDynamicRowHeight, type RowComponentProps } from "react-window";
import { useT } from "../lib/locale-context";
import {
  flattenFileTreeRows,
  shouldVirtualizeFileTree,
  type FileTreeRow,
} from "../lib/file-tree-window";

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

type FileTreeVirtualProps = {
  rows: FileTreeRow[];
  t: (key: "file.folders" | "file.files" | "file.search") => string;
  onPreview: (path: string) => void;
  onAddToChat: (path: string) => void;
};

function FileTreeNodeRow({
  node,
  onPreview,
  onAddToChat,
}: {
  node: FileTreeNode;
  onPreview: (path: string) => void;
  onAddToChat: (path: string) => void;
}) {
  return (
    <div className="file-row">
      <button type="button" className="file-item" onClick={() => onPreview(node.path)}>
        {node.name}
      </button>
      <button type="button" className="btn ghost" onClick={() => onAddToChat(asMention(node.path))}>
        @
      </button>
    </div>
  );
}

function FileTreeVirtualRow({
  index,
  style,
  rows,
  t,
  onPreview,
  onAddToChat,
}: RowComponentProps<FileTreeVirtualProps>) {
  const row = rows[index];
  return (
    <div style={style}>
      {row.kind === "heading" ? (
        <div className="file-folder">{t(row.labelKey)}</div>
      ) : (
        <FileTreeNodeRow node={row.node} onPreview={onPreview} onAddToChat={onAddToChat} />
      )}
    </div>
  );
}

/**
 * Searchable workspace list. Click a row to preview; join-chat inserts `@path`.
 */
export function FileTree({ nodes, query, onQuery, onPreview, onAddToChat, onReveal }: FileTreeProps) {
  const t = useT();
  const q = query.trim().toLowerCase();
  const visible = q
    ? nodes.filter((n) => n.name.toLowerCase().includes(q) || n.path.toLowerCase().includes(q))
    : nodes;
  const dirs = visible.filter((n) => n.kind === "dir");
  const files = visible.filter((n) => n.kind === "file");
  const rows = useMemo(() => flattenFileTreeRows(dirs, files), [dirs, files]);
  const virtualize = shouldVirtualizeFileTree(rows);
  const rowHeight = useDynamicRowHeight({ defaultRowHeight: 32 });
  const virtualRowProps = useMemo(
    () => ({ rows, t, onPreview, onAddToChat }),
    [rows, t, onPreview, onAddToChat],
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
          <p className="float-empty">{q ? t("file.noMatch") : t("explorer.noFiles")}</p>
          {!q && onReveal ? (
            <div className="set-actions">
              <button type="button" className="btn ghost" onClick={onReveal}>
                {t("hub.openFinder")}
              </button>
            </div>
          ) : null}
        </div>
      ) : virtualize ? (
        <div className="file-list virtualized">
          <List
            className="file-tree-list"
            rowComponent={FileTreeVirtualRow}
            rowCount={rows.length}
            rowHeight={rowHeight}
            rowProps={virtualRowProps}
            overscanCount={8}
          />
        </div>
      ) : (
        <div className="file-list">
          {rows.map((row) =>
            row.kind === "heading" ? (
              <div className="file-folder" key={row.key}>
                {t(row.labelKey)}
              </div>
            ) : (
              <FileTreeNodeRow
                key={row.key}
                node={row.node}
                onPreview={onPreview}
                onAddToChat={onAddToChat}
              />
            ),
          )}
        </div>
      )}
    </section>
  );
}
