import { useEffect, useState } from "react";
import { listWorkspaceEntries, type WorkspaceEntry } from "../api";
import { explorerDirOpen } from "../lib/explorer";
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

function ExplorerNode({
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
  const [kids, setKids] = useState<WorkspaceEntry[] | null>(null);

  useEffect(() => {
    if (entry.kind !== "dir" || !open) return;
    let cancelled = false;
    void listWorkspaceEntries(entry.path)
      .then((rows) => {
        if (!cancelled) setKids(rows);
      })
      .catch(() => {
        if (!cancelled) setKids([]);
      });
    return () => {
      cancelled = true;
    };
  }, [entry.kind, entry.path, open]);

  if (entry.kind === "dir") {
    return (
      <div className="explorer-node">
        <div className="file-entry explorer-dir" style={{ paddingLeft: 4 + depth * 12 }}>
          <button
            type="button"
            className="file-entry-main"
            aria-expanded={open}
            data-tip={entry.path}
            onClick={() => onToggleDir(entry.path)}
          >
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
              data-tip={t("session.attach")}
              aria-label={t("session.attach")}
              onClick={() => onAttach(entry.path, "dir")}
            >
              <IconPaperclip size={14} />
            </button>
          ) : null}
          <button
            type="button"
            className="file-open file-finder"
            data-tip={t("finder.open")}
            aria-label={t("finder.open")}
            onClick={() => onReveal(entry.path)}
          >
            <IconFinder size={14} />
          </button>
        </div>
        {open ? (
          kids === null ? (
            <p className="float-empty explorer-loading">{t("explorer.loading")}</p>
          ) : kids.length === 0 ? (
            <p className="float-empty explorer-loading">{t("explorer.emptyFolder")}</p>
          ) : (
            kids.map((child) => (
              <ExplorerNode
                key={child.path}
                entry={child}
                depth={depth + 1}
                expandedDirs={expandedDirs}
                onToggleDir={onToggleDir}
                onPreview={onPreview}
                onReveal={onReveal}
                onAttach={onAttach}
              />
            ))
          )
        ) : null}
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

/** Simple project-tree viewer. Not a Finder or IDE explorer. */
export function ExplorerPane({ cwd, expandedDirs, onToggleDir, onPreview, onReveal, onAttach }: ExplorerPaneProps) {
  const t = useT();
  const [roots, setRoots] = useState<WorkspaceEntry[] | null>(null);

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

  if (!cwd) {
    return <p className="float-empty">{t("explorer.noWorkspace")}</p>;
  }
  if (roots === null) {
    return <p className="float-empty">{t("explorer.loading")}</p>;
  }
  if (roots.length === 0) {
    return <p className="float-empty">{t("explorer.noFiles")}</p>;
  }

  return (
    <div className="file-list explorer-tree">
      {roots.map((entry) => (
        <ExplorerNode
          key={entry.path}
          entry={entry}
          depth={0}
          expandedDirs={expandedDirs}
          onToggleDir={onToggleDir}
          onPreview={onPreview}
          onReveal={onReveal}
          onAttach={onAttach}
        />
      ))}
    </div>
  );
}
