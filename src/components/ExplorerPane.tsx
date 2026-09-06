import { useEffect, useState } from "react";
import { listWorkspaceEntries, type WorkspaceEntry } from "../api";
import { IconFinder, IconFolder, IconFolderOpen } from "../icons";
import { FileListRow } from "./FileListRow";
import { useT } from "../lib/locale-context";

export type ExplorerPaneProps = {
  cwd: string;
  onPreview: (path: string) => void;
  onReveal: (path: string) => void;
};

function ExplorerNode({
  entry,
  depth,
  onPreview,
  onReveal,
}: {
  entry: WorkspaceEntry;
  depth: number;
  onPreview: (path: string) => void;
  onReveal: (path: string) => void;
}) {
  const t = useT();
  const [open, setOpen] = useState(false);
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
            onClick={() => setOpen((v) => !v)}
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
                onPreview={onPreview}
                onReveal={onReveal}
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
      />
    </div>
  );
}

/** Simple project-tree viewer. Not a Finder or IDE explorer. */
export function ExplorerPane({ cwd, onPreview, onReveal }: ExplorerPaneProps) {
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
          onPreview={onPreview}
          onReveal={onReveal}
        />
      ))}
    </div>
  );
}
