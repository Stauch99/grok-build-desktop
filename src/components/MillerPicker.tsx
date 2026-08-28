import { useEffect, useState } from "react";
import { listWorkspaceEntries, type WorkspaceEntry } from "../api";
import { millerPath, millerPush, millerRoot, type MillerColumn } from "../lib/miller";
import { IconClose } from "../icons";

export type MillerPickerProps = {
  root: string;
  onPick: (path: string) => void;
  onClose: () => void;
};

export function MillerPicker({ root, onPick, onClose }: MillerPickerProps) {
  const [stack, setStack] = useState<MillerColumn[]>(() => millerRoot(root));
  const [entries, setEntries] = useState<WorkspaceEntry[]>([]);

  const path = millerPath(stack);

  useEffect(() => {
    void listWorkspaceEntries(path).then(setEntries).catch(() => setEntries([]));
  }, [path]);

  return (
    <div className="settings-layer" role="presentation">
      <div className="settings-backdrop" onClick={onClose} />
      <div className="settings-dialog extra-dialog" role="dialog" aria-modal="true" aria-label="选择工作区">
        <header className="settings-head">
          <strong>选择工作区</strong>
          <button type="button" className="icon-btn" onClick={onClose} title="关闭" aria-label="关闭">
            <IconClose size={16} />
          </button>
        </header>
        <div className="settings-body">
          <p className="hub-meta">{path}</p>
          <ul className="hub-rows">
            {entries.map((e) => (
              <li key={e.path} className="hub-row">
                <button
                  type="button"
                  className="hub-row-main"
                  onClick={() => {
                    if (e.kind === "dir") setStack((s) => millerPush(s, { path: e.path, name: e.name }));
                    else onPick(e.path);
                  }}
                >
                  <strong>{e.name}</strong>
                  <span className="hub-meta">{e.kind === "dir" ? "文件夹" : "文件"}</span>
                </button>
              </li>
            ))}
          </ul>
          <div className="set-actions">
            <button type="button" className="btn primary" onClick={() => onPick(path)}>
              使用此目录
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}
