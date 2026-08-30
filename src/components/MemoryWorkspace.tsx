import { useState } from "react";
import { openPath, readTextFile, writeAllowedText } from "../api";
import { IconEdit } from "../icons";
import { t, type Locale } from "../lib/i18n";
import type { DiaryEntry, OverlayStatus } from "../lib/memory-view";
import { MemoryDreamPane } from "./MemoryDreamPane";
import { MemoryEditor } from "./MemoryEditor";

export type MemoryWorkspaceProps = {
  memoryPath?: string;
  agentsPath?: string;
  cwd?: string;
  onOpen: (path: string) => void;
  onEdit: (path: string) => void;
  diary?: DiaryEntry[];
  status?: OverlayStatus;
  corpus?: string | null;
  onDreamNow?: () => void;
  onOpenUserMd?: () => void;
  locale?: Locale;
};

/**
 * User dream diary plus the cwd-scoped MEMORY.md / AGENTS.md rows,
 * folded under 项目文件.
 */
export function MemoryWorkspace({
  memoryPath,
  agentsPath,
  cwd,
  onOpen,
  onEdit,
  diary = [],
  status = { kind: "idle", lastAt: null },
  corpus = null,
  onDreamNow,
  onOpenUserMd,
  locale = "zh",
}: MemoryWorkspaceProps) {
  return (
    <div className="memory-workspace">
      <MemoryDreamPane
        entries={diary}
        status={status}
        corpus={corpus}
        onDreamNow={onDreamNow ?? (() => {})}
        onOpenUserMd={onOpenUserMd ?? (() => {})}
        locale={locale}
      />
      <details className="memory-project-files">
        <summary>{t(locale, "memory.projectFiles")}</summary>
        <DocRow heading="MEMORY.md" path={memoryPath} cwd={cwd} onOpen={onOpen} onEdit={onEdit} />
        <DocRow heading="AGENTS.md" path={agentsPath} cwd={cwd} onOpen={onOpen} onEdit={onEdit} />
      </details>
    </div>
  );
}

function DocRow({
  heading,
  path,
  cwd,
  onOpen,
  onEdit,
}: {
  heading: string;
  path?: string;
  cwd?: string;
  onOpen: (path: string) => void;
  onEdit: (path: string) => void;
}) {
  const [editing, setEditing] = useState(false);
  const [text, setText] = useState("");
  const [saved, setSaved] = useState("");
  const [note, setNote] = useState<string | null>(null);

  async function beginEdit() {
    if (!path) return;
    onEdit(path);
    try {
      const row = await readTextFile(path, cwd || null);
      setText(row.text);
      setSaved(row.text);
      setEditing(true);
      setNote(null);
    } catch (e) {
      setNote(String(e));
    }
  }

  async function save() {
    if (!path) return;
    try {
      await writeAllowedText(path, text, cwd || null);
      setSaved(text);
      setNote("已保存");
    } catch (e) {
      setNote(String(e));
    }
  }

  if (!path) {
    return <p className="float-empty">还没有 {heading}</p>;
  }

  return (
    <div>
      <div className="hub-row">
        <button type="button" className="hub-row-main" onClick={() => onOpen(path)}>
          <strong>{heading}</strong>
        </button>
        <div className="hub-row-side">
          <button type="button" className="file-open" onClick={() => void beginEdit()} title="编辑" aria-label="编辑">
            <IconEdit size={14} />
          </button>
        </div>
      </div>
      {editing ? (
        <MemoryEditor
          path={path}
          text={text}
          dirty={text !== saved}
          onChange={setText}
          onSave={() => void save()}
          onReveal={() => void openPath(path)}
        />
      ) : null}
      {note ? <p className="set-note">{note}</p> : null}
    </div>
  );
}
