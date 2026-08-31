import type { SessionSummary } from "./api";

export type SessionMenuState = {
  kind: "header" | "row";
  id: string;
  top: number;
  left: number;
};

type Props = {
  session: SessionSummary;
  hasOverride: boolean;
  top: number;
  left: number;
  onRename: () => void;
  onRestore: () => void;
  onNew: () => void;
  onNewLabel: string;
  onMoveToProject: (() => void) | null;
  onReveal: (() => void) | null;
  onCopyId: () => void;
  onCopyCwd: () => void;
  onSplit: (() => void) | null;
  onSplitLabel?: string;
  onFork?: (() => void) | null;
  onPin?: (() => void) | null;
  onArchive?: (() => void) | null;
  pinned?: boolean;
  archived?: boolean;
  onDelete: () => void;
};

export function SessionMenu({
  session,
  hasOverride,
  top,
  left,
  onRename,
  onRestore,
  onNew,
  onNewLabel,
  onMoveToProject,
  onReveal,
  onCopyId,
  onCopyCwd,
  onSplit,
  onSplitLabel = "向右拆开",
  onFork,
  onPin,
  onArchive,
  pinned = false,
  archived = false,
  onDelete,
}: Props) {
  return (
    <div className="menu" style={{ top, left }} role="menu">
      <button type="button" onClick={onRename}>重命名</button>
      <button type="button" onClick={onRestore} disabled={!hasOverride}>恢复自动标题</button>
      <button type="button" onClick={onNew}>{onNewLabel}</button>
      {onSplit ? <button type="button" onClick={onSplit}>{onSplitLabel}</button> : null}
      {onFork ? <button type="button" onClick={onFork}>分叉</button> : null}
      {onMoveToProject ? <button type="button" onClick={onMoveToProject}>移入项目…</button> : null}
      <div className="sep" />
      <button type="button" onClick={onReveal ?? undefined} disabled={!onReveal}>在访达中显示</button>
      <button type="button" onClick={onCopyId}>复制会话 ID</button>
      <button type="button" onClick={onCopyCwd} disabled={!session.cwd}>复制项目路径</button>
      <div className="sep" />
      {onPin ? <button type="button" onClick={onPin}>{pinned ? "取消置顶" : "置顶"}</button> : null}
      {onArchive ? (
        <button type="button" onClick={onArchive}>{archived ? "取消归档" : "归档"}</button>
      ) : null}
      <button type="button" className="danger" onClick={onDelete}>删除</button>
    </div>
  );
}

export function menuPosition(el: HTMLElement, point?: { clientX: number; clientY: number }): { top: number; left: number } {
  const width = 210;
  if (point) {
    return {
      left: Math.min(window.innerWidth - width - 8, Math.max(8, point.clientX)),
      top: Math.min(window.innerHeight - 320, Math.max(8, point.clientY)),
    };
  }
  const r = el.getBoundingClientRect();
  return {
    left: Math.min(window.innerWidth - width, Math.max(8, r.left)),
    top: Math.min(window.innerHeight - 320, r.bottom + 4),
  };
}

export function ProjectMenu({
  top,
  left,
  pinned,
  onPin,
}: {
  top: number;
  left: number;
  pinned: boolean;
  onPin: () => void;
}) {
  return (
    <div className="menu" style={{ top, left }} role="menu">
      <button type="button" onClick={onPin}>{pinned ? "取消置顶" : "置顶"}</button>
    </div>
  );
}
