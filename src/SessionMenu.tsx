import type { SessionSummary } from "./api";
import { useT } from "./lib/locale-context";

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
  onSplitLabel,
  onFork,
  onPin,
  onArchive,
  pinned = false,
  archived = false,
  onDelete,
}: Props) {
  const t = useT();
  const splitLabel = onSplitLabel ?? t("pane.splitRight");
  return (
    <div className="menu" style={{ top, left }} role="menu">
      <button type="button" onClick={onRename}>{t("menu.rename")}</button>
      <button type="button" onClick={onRestore} disabled={!hasOverride}>{t("menu.restoreTitle")}</button>
      <button type="button" onClick={onNew}>{onNewLabel}</button>
      {onSplit ? <button type="button" onClick={onSplit}>{splitLabel}</button> : null}
      {onFork ? <button type="button" onClick={onFork}>{t("menu.fork")}</button> : null}
      {onMoveToProject ? <button type="button" onClick={onMoveToProject}>{t("menu.moveToProject")}</button> : null}
      <div className="sep" />
      <button type="button" onClick={onReveal ?? undefined} disabled={!onReveal}>{t("menu.reveal")}</button>
      <button type="button" onClick={onCopyId}>{t("menu.copyId")}</button>
      <button type="button" onClick={onCopyCwd} disabled={!session.cwd}>{t("menu.copyCwd")}</button>
      <div className="sep" />
      {onPin ? <button type="button" onClick={onPin}>{pinned ? t("menu.unpin") : t("menu.pin")}</button> : null}
      {onArchive ? (
        <button type="button" onClick={onArchive}>{archived ? t("menu.unarchive") : t("menu.archive")}</button>
      ) : null}
      <button type="button" className="danger" onClick={onDelete}>{t("menu.delete")}</button>
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
  groups = [],
  currentGroupId = null,
  onMoveToGroup,
  onUngroup,
  onCreateGroup,
}: {
  top: number;
  left: number;
  pinned: boolean;
  onPin: () => void;
  groups?: { id: string; name: string }[];
  currentGroupId?: string | null;
  onMoveToGroup?: (groupId: string) => void;
  onUngroup?: () => void;
  onCreateGroup?: () => void;
}) {
  const t = useT();
  return (
    <div className="menu" style={{ top, left }} role="menu">
      <button type="button" onClick={onPin}>{pinned ? t("menu.unpin") : t("menu.pin")}</button>
      {onMoveToGroup || onCreateGroup ? <div className="sep" /> : null}
      {groups.map((group) => (
        <button
          key={group.id}
          type="button"
          disabled={group.id === currentGroupId}
          onClick={() => onMoveToGroup?.(group.id)}
        >
          {t("sidebar.moveToGroup", { name: group.name })}
        </button>
      ))}
      {onCreateGroup ? (
        <button type="button" onClick={onCreateGroup}>{t("sidebar.newGroup")}</button>
      ) : null}
      {currentGroupId && onUngroup ? (
        <button type="button" onClick={onUngroup}>{t("sidebar.ungroupProject")}</button>
      ) : null}
    </div>
  );
}

export function GroupMenu({
  top,
  left,
  onRename,
  onDelete,
}: {
  top: number;
  left: number;
  onRename: () => void;
  onDelete: () => void;
}) {
  const t = useT();
  return (
    <div className="menu" style={{ top, left }} role="menu">
      <button type="button" onClick={onRename}>{t("sidebar.renameGroup")}</button>
      <button type="button" className="danger" onClick={onDelete}>{t("sidebar.deleteGroup")}</button>
    </div>
  );
}
