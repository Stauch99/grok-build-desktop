import { useState } from "react";
import { IconGrokClose } from "../grok-icons";
import { IconFinder } from "../icons";
import { nestPaths, type TreeNode } from "../lib/miller";
import { basename } from "../lib/text";

export type FilePanelArtifact = { path: string; kind?: string };
export type FilePanelEntry = { name: string; path: string; kind: "file" | "dir" };

type Props = {
  artifacts: FilePanelArtifact[];
  cwd?: string;
  entries?: FilePanelEntry[];
  onOpenPath: (path: string) => void;
  onPreview?: (path: string) => void;
  onClose?: () => void;
};

function stripCwd(path: string, cwd?: string): string {
  if (!cwd) return path;
  const root = cwd.replace(/\/+$/, "");
  if (path === root) return "";
  if (path.startsWith(`${root}/`)) return path.slice(root.length + 1);
  return path;
}

function joinCwd(path: string, cwd?: string): string {
  if (!cwd || path.startsWith("/")) return path;
  return `${cwd.replace(/\/+$/, "")}/${path}`;
}

function FileRow({
  path,
  name,
  onOpenPath,
  onPreview,
}: {
  path: string;
  name: string;
  onOpenPath: (path: string) => void;
  onPreview?: (path: string) => void;
}) {
  return (
    <div className="file-row">
      <button
        type="button"
        className="file-item"
        title={path}
        onClick={() => (onPreview ? onPreview(path) : onOpenPath(path))}
      >
        {name}
      </button>
      <button
        type="button"
        className="file-open"
        title="在访达中打开"
        aria-label="在访达中打开"
        onClick={() => onOpenPath(path)}
      >
        <IconFinder size={14} />
      </button>
    </div>
  );
}

function TreeRows({
  nodes,
  depth,
  dirPaths,
  cwd,
  collapsed,
  onToggle,
  onOpenPath,
  onPreview,
}: {
  nodes: TreeNode[];
  depth: number;
  dirPaths: Set<string>;
  cwd?: string;
  collapsed: Set<string>;
  onToggle: (path: string) => void;
  onOpenPath: (path: string) => void;
  onPreview?: (path: string) => void;
}) {
  return (
    <>
      {nodes.map((node) => {
        const abs = joinCwd(node.path, cwd);
        const nested = node.children && node.children.length > 0;
        const isDir = nested || dirPaths.has(node.path);
        const open = nested && !collapsed.has(node.path);
        if (nested) {
          return (
            <div key={node.path} className="file-group">
              <button
                type="button"
                className="file-folder"
                style={{ paddingLeft: 2 + depth * 12, width: "100%", border: 0, background: "transparent", cursor: "pointer" }}
                title={abs}
                aria-expanded={open}
                onClick={() => onToggle(node.path)}
              >
                {open ? "▾" : "▸"} {node.name}
              </button>
              {open ? (
                <TreeRows
                  nodes={node.children!}
                  depth={depth + 1}
                  dirPaths={dirPaths}
                  cwd={cwd}
                  collapsed={collapsed}
                  onToggle={onToggle}
                  onOpenPath={onOpenPath}
                  onPreview={onPreview}
                />
              ) : null}
            </div>
          );
        }
        return (
          <div key={node.path} style={depth ? { paddingLeft: depth * 12 } : undefined}>
            <FileRow
              path={abs}
              name={node.name}
              onOpenPath={onOpenPath}
              onPreview={isDir ? undefined : onPreview}
            />
          </div>
        );
      })}
    </>
  );
}

export function FilePanel({
  artifacts,
  cwd,
  entries,
  onOpenPath,
  onPreview,
  onClose,
}: Props) {
  const artifactTree = nestPaths(artifacts.map((a) => stripCwd(a.path, cwd)).filter(Boolean));
  const entryTree = entries
    ? nestPaths(entries.map((e) => stripCwd(e.path, cwd)).filter(Boolean))
    : [];
  const dirPaths = new Set(
    (entries ?? [])
      .filter((e) => e.kind === "dir")
      .map((e) => stripCwd(e.path, cwd))
      .filter(Boolean),
  );
  const [collapsed, setCollapsed] = useState<Set<string>>(() => new Set());
  const onToggle = (path: string) => {
    setCollapsed((prev) => {
      const next = new Set(prev);
      if (next.has(path)) next.delete(path);
      else next.add(path);
      return next;
    });
  };

  return (
    <div className="file-panel">
      {onClose ? (
        <button
          type="button"
          className="icon-btn file-panel-close"
          aria-label="关闭"
          title="关闭"
          onClick={onClose}
        >
          <IconGrokClose size={16} />
        </button>
      ) : null}
      {cwd ? (
        <div className="file-folder" title={cwd}>
          {basename(cwd)}
        </div>
      ) : null}

      {artifacts.length > 0 ? (
        <div className="file-list">
          <TreeRows
            nodes={artifactTree}
            depth={0}
            dirPaths={dirPaths}
            cwd={cwd}
            collapsed={collapsed}
            onToggle={onToggle}
            onOpenPath={onOpenPath}
            onPreview={onPreview}
          />
        </div>
      ) : null}

      {entries ? (
        <>
          <div className="file-folder">工作区</div>
          <div className="file-list">
            <TreeRows
              nodes={entryTree}
              depth={0}
              dirPaths={dirPaths}
              cwd={cwd}
              collapsed={collapsed}
              onToggle={onToggle}
              onOpenPath={onOpenPath}
              onPreview={onPreview}
            />
          </div>
        </>
      ) : null}
    </div>
  );
}
