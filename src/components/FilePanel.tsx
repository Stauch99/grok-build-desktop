import { IconGrokClose } from "../grok-icons";
import { IconFinder } from "../icons";
import { basename, groupArtifactsByFolder } from "../lib/text";

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

export function FilePanel({
  artifacts,
  cwd,
  entries,
  onOpenPath,
  onPreview,
  onClose,
}: Props) {
  const groups = groupArtifactsByFolder(artifacts.map((a) => a.path));
  const dirs = entries?.filter((e) => e.kind === "dir") ?? [];
  const files = entries?.filter((e) => e.kind === "file") ?? [];

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
          {groups.map((g) => (
            <div key={g.folder || g.files[0]?.path} className="file-group">
              {g.folder ? <div className="file-folder">{g.folder}</div> : null}
              {g.files.map((f) => (
                <FileRow
                  key={f.path}
                  path={f.path}
                  name={f.name}
                  onOpenPath={onOpenPath}
                  onPreview={onPreview}
                />
              ))}
            </div>
          ))}
        </div>
      ) : null}

      {entries ? (
        <>
          <div className="file-folder">工作区</div>
          <div className="file-list">
            {dirs.map((e) => (
              <FileRow
                key={e.path}
                path={e.path}
                name={e.name}
                onOpenPath={onOpenPath}
              />
            ))}
            {files.map((e) => (
              <FileRow
                key={e.path}
                path={e.path}
                name={e.name}
                onOpenPath={onOpenPath}
                onPreview={onPreview}
              />
            ))}
          </div>
        </>
      ) : null}
    </div>
  );
}
