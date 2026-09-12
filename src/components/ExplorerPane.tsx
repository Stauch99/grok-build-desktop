import { useEffect, useMemo, useState } from "react";
import { List, useDynamicRowHeight, type RowComponentProps } from "react-window";
import { listWorkspaceEntries, type WorkspaceEntry } from "../api";
import { explorerDirOpen, flattenExplorerRows, type ExplorerFlatRow } from "../lib/explorer";
import { FILE_TREE_VIRTUALIZE_AFTER } from "../lib/file-tree-window";
import { IconFinder, IconFolder, IconFolderOpen, IconPaperclip } from "../icons";
import { FileListRow } from "./FileListRow";
import { useT } from "../lib/locale-context";

export type ExplorerPaneProps = {
  cwd: string;
  expandedDirs: readonly string[];
  onToggleDir: (path: string) => void;
  onPreview: (path: string) => void;
  onReveal: (path: string) => void;
  onAttach?: (path: string, kind: "file" | "dir") => void;
};

type ExplorerVirtualProps = {
  rows: ExplorerFlatRow[];
  expandedDirs: readonly string[];
  onToggleDir: (path: string) => void;
  onPreview: (path: string) => void;
  onReveal: (path: string) => void;
  onAttach?: (path: string, kind: "file" | "dir") => void;
  t: (key: string) => string;
};

function ExplorerEntryRow({
  entry,
  depth,
  expandedDirs,
  onToggleDir,
  onPreview,
  onReveal,
  onAttach,
}: {
  entry: WorkspaceEntry;
  depth: number;
  expandedDirs: readonly string[];
  onToggleDir: (path: string) => void;
  onPreview: (path: string) => void;
  onReveal: (path: string) => void;
  onAttach?: (path: string, kind: "file" | "dir") => void;
}) {
  const t = useT();
  const open = explorerDirOpen(expandedDirs, entry.path);
  if (entry.kind === "dir") {
    return (
      <div className="file-entry explorer-dir" style={{ paddingLeft: 4 + depth * 12 }}>
        <button type="button" className="file-entry-main" aria-expanded={open} onClick={() => onToggleDir(entry.path)}>
          <span className="explorer-twist" aria-hidden>
            {open ? "▾" : "▸"}
          </span>
          <span className="file-entry-icon" aria-hidden>
            {open ? <IconFolderOpen size={14} /> : <IconFolder size={14} />}
          </span>
          <span className="file-entry-text">
            <span className="file-entry-name">{entry.name}</span>
          </span>
        </button>
        {onAttach ? (
          <button
            type="button"
            className="file-open file-attach"
            aria-label={t("session.attach")}
            onClick={() => onAttach(entry.path, "dir")}
          >
            <IconPaperclip size={14} />
          </button>
        ) : null}
        <button
          type="button"
          className="file-open file-finder"
          aria-label={t("finder.open")}
          onClick={() => onReveal(entry.path)}
        >
          <IconFinder size={14} />
        </button>
      </div>
    );
  }
  return (
    <div style={{ paddingLeft: 4 + depth * 12 }}>
      <FileListRow
        name={entry.name}
        path={entry.path}
        onOpen={() => onPreview(entry.path)}
        onReveal={() => onReveal(entry.path)}
        onAttach={onAttach ? () => onAttach(entry.path, "file") : undefined}
      />
    </div>
  );
}

function ExplorerVirtualRow({
  index,
  style,
  rows,
  expandedDirs,
  onToggleDir,
  onPreview,
  onReveal,
  onAttach,
  t,
}: RowComponentProps<ExplorerVirtualProps>) {
  const row = rows[index];
  return (
    <div style={style}>
      {row.kind === "status" ? (
        <p className="float-empty explorer-loading" style={{ paddingLeft: 22 + row.depth * 12 }}>
          {t(row.status === "loading" ? "explorer.loading" : "explorer.emptyFolder")}
        </p>
      ) : (
        <ExplorerEntryRow
          entry={row.entry as WorkspaceEntry}
          depth={row.depth}
          expandedDirs={expandedDirs}
          onToggleDir={onToggleDir}
          onPreview={onPreview}
          onReveal={onReveal}
          onAttach={onAttach}
        />
      )}
    </div>
  );
}

/** Simple project-tree viewer. Not a Finder or IDE explorer. */
export function ExplorerPane({ cwd, expandedDirs, onToggleDir, onPreview, onReveal, onAttach }: ExplorerPaneProps) {
  const t = useT();
  const [roots, setRoots] = useState<WorkspaceEntry[] | null>(null);
  const [kidsByPath, setKidsByPath] = useState<Record<string, WorkspaceEntry[]>>({});

  useEffect(() => {
    if (!cwd) {
      setRoots([]);
      return;
    }
    let cancelled = false;
    void listWorkspaceEntries(cwd)
      .then((rows) => {
        if (!cancelled) setRoots(rows);
      })
      .catch(() => {
        if (!cancelled) setRoots([]);
      });
    return () => {
      cancelled = true;
    };
  }, [cwd]);

  useEffect(() => {
    if (!roots) return;
    const pending = expandedDirs.filter((path) => kidsByPath[path] == null);
    if (pending.length === 0) return;
    let cancelled = false;
    void Promise.all(
      pending.map(async (path) => {
        const rows = await listWorkspaceEntries(path).catch(() => [] as WorkspaceEntry[]);
        return [path, rows] as const;
      }),
    ).then((pairs) => {
      if (cancelled) return;
      setKidsByPath((prev) => {
        const next = { ...prev };
        for (const [path, rows] of pairs) next[path] = rows;
        return next;
      });
    });
    return () => {
      cancelled = true;
    };
  }, [roots, expandedDirs, kidsByPath]);

  const rows = useMemo(
    () => (roots ? flattenExplorerRows(roots, expandedDirs, kidsByPath) : []),
    [roots, expandedDirs, kidsByPath],
  );
  const virtualize = rows.length > FILE_TREE_VIRTUALIZE_AFTER;
  const rowHeight = useDynamicRowHeight({ defaultRowHeight: 28 });
  const virtualRowProps = useMemo(
    () => ({ rows, expandedDirs, onToggleDir, onPreview, onReveal, onAttach, t }),
    [rows, expandedDirs, onToggleDir, onPreview, onReveal, onAttach, t],
  );

  if (!cwd) {
    return <p className="float-empty">{t("explorer.noWorkspace")}</p>;
  }
  if (roots === null) {
    return <p className="float-empty">{t("explorer.loading")}</p>;
  }
  if (roots.length === 0) {
    return <p className="float-empty">{t("explorer.noFiles")}</p>;
  }

  const renderRow = (row: ExplorerFlatRow) =>
    row.kind === "status" ? (
      <p key={row.key} className="float-empty explorer-loading" style={{ paddingLeft: 22 + row.depth * 12 }}>
        {t(row.status === "loading" ? "explorer.loading" : "explorer.emptyFolder")}
      </p>
    ) : (
      <ExplorerEntryRow
        key={row.key}
        entry={row.entry as WorkspaceEntry}
        depth={row.depth}
        expandedDirs={expandedDirs}
        onToggleDir={onToggleDir}
        onPreview={onPreview}
        onReveal={onReveal}
        onAttach={onAttach}
      />
    );

  return (
    <div className={`file-list explorer-tree${virtualize ? " virtualized" : ""}`}>
      {virtualize ? (
        <List
          className="explorer-list"
          rowComponent={ExplorerVirtualRow}
          rowCount={rows.length}
          rowHeight={rowHeight}
          rowProps={virtualRowProps}
          overscanCount={8}
        />
      ) : (
        rows.map(renderRow)
      )}
    </div>
  );
}
