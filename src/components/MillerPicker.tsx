import { useEffect, useState } from "react";
import { listWorkspaceEntries, type WorkspaceEntry } from "../api";
import { millerPath, millerPop, millerPush, millerRoot, type MillerColumn } from "../lib/miller";
import { IconClose } from "../icons";
import { useT } from "../lib/locale-context";

export type MillerPickerProps = {
  root: string;
  onPick: (path: string) => void;
  onClose: () => void;
};

export function MillerPicker({ root, onPick, onClose }: MillerPickerProps) {
  const t = useT();
  const [stack, setStack] = useState<MillerColumn[]>(() => millerRoot(root));
  const [entries, setEntries] = useState<WorkspaceEntry[]>([]);

  const path = millerPath(stack);

  useEffect(() => {
    void listWorkspaceEntries(path).then(setEntries).catch(() => setEntries([]));
  }, [path]);

  return (
    <div className="settings-layer" role="presentation">
      <div className="settings-backdrop" onClick={onClose} />
      <div
        className="settings-dialog extra-dialog"
        role="dialog"
        aria-modal="true"
        aria-label={t("miller.title")}
        onKeyDown={(e) => {
          if (e.key !== "Backspace") return;
          const target = e.target as HTMLElement | null;
          if (target && /^(INPUT|TEXTAREA)$/.test(target.tagName)) return;
          e.preventDefault();
          setStack((s) => millerPop(s));
        }}
      >
        <header className="settings-head">
          <strong>{t("miller.title")}</strong>
          <button type="button" className="icon-btn" onClick={onClose} data-tip={t("common.close")} aria-label={t("common.close")}>
            <IconClose size={16} />
          </button>
        </header>
        <div className="settings-body">
          <p className="hub-meta" aria-label={t("miller.title")}>
            {stack.map((col, i) => (
              <span key={`${col.path}-${i}`}>
                {i > 0 ? " / " : null}
                <button
                  type="button"
                  className="session-title-btn"
                  onClick={() => setStack((s) => s.slice(0, i + 1))}
                >
                  {col.name}
                </button>
              </span>
            ))}
          </p>
          <ul
            className="hub-rows"
            onKeyDown={(e) => {
              if (e.key !== "Backspace") return;
              e.preventDefault();
              setStack((s) => millerPop(s));
            }}
          >
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
                  <span className="hub-meta">{e.kind === "dir" ? t("file.folders") : t("file.files")}</span>
                </button>
              </li>
            ))}
          </ul>
          <div className="set-actions">
            {stack.length > 1 ? (
              <button type="button" className="btn ghost" onClick={() => setStack((s) => millerPop(s))}>
                {t("miller.back")}
              </button>
            ) : null}
            <button type="button" className="btn primary" onClick={() => onPick(path)}>
              {t("miller.use")}
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}
