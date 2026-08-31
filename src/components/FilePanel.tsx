import { fileListEntry } from "../lib/file-row";
import { FileListRow } from "./FileListRow";

export type FilePanelArtifact = { path: string; kind?: string };

type Props = {
  artifacts: FilePanelArtifact[];
  cwd?: string;
  onOpenPath: (path: string) => void;
  onPreview?: (path: string) => void;
};

export function FilePanel({ artifacts, cwd, onOpenPath, onPreview }: Props) {
  return (
    <div className="file-panel">
      <div className="file-list">
        {artifacts.map((a) => {
          const { name, crumb } = fileListEntry(a.path, cwd);
          return (
            <FileListRow
              key={a.path}
              name={name}
              crumb={crumb}
              path={a.path}
              onOpen={() => (onPreview ? onPreview(a.path) : onOpenPath(a.path))}
              onReveal={() => onOpenPath(a.path)}
            />
          );
        })}
      </div>
    </div>
  );
}
