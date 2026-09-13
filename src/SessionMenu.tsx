import { useEffect, useRef } from "react";
import type { SessionSummary } from "./api";
import { useT } from "./lib/locale-context";
import { focusables, trapFocus } from "./lib/trap-focus";

export type SessionMenuState = {
  kind: "header" | "row";
  id: string;
  top: number;
  left: number;
  /** Element that opened the menu; focus returns here on close. */
  trigger?: HTMLElement | null;
};

type Props = {
  session: SessionSummary;
  hasOverride: boolean;
  top: number;
  left: number;
  trigger?: HTMLElement | null;
  isUnread: boolean;
  muted: boolean;
  note: string;
  onRename: () => void;
  onRestore: () => void;
  onNew: () => void;
  onNewLabel: string;
  onDuplicate: () => void;
  onEditNote: () => void;
  onMarkUnread: () => void;
  onToggleMute: () => void;
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
  trigger,
  isUnread,
  muted,
  note,
  onRename,
  onRestore,
  onNew,
  onNewLabel,
  onDuplicate,
  onEditNote,
  onMarkUnread,
  onToggleMute,
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
  const menuRef = useRef<HTMLDivElement>(null);
  const previousActive = useRef<HTMLElement | null>(null);

  // Focus the first item so Tab has somewhere to wrap from, then hand focus
  // back to the trigger (or whatever was focused) when the menu unmounts.
  useEffect(() => {
    previousActive.current =
      document.activeElement instanceof HTMLElement ? document.activeElement : null;
    if (menuRef.current) focusables(menuRef.current)[0]?.focus();
    return () => {
      const prev = previousActive.current;
      previousActive.current = null;
      // Right-click menus pass the row as the trigger; rows are not focusable,
      // so fall back to whatever held focus when the menu opened.
      const canFocus = (el: HTMLElement | null | undefined): el is HTMLElement =>
        !!el && el.isConnected && (el.tabIndex >= 0 || /^(button|a|input|select|textarea)$/i.test(el.tagName));
      (canFocus(trigger) ? trigger : canFocus(prev) ? prev : null)?.focus();
    };
  }, [trigger]);

  return (
    <div
      ref={menuRef}
      className="menu"
      style={{ top, left }}
      role="menu"
      onKeyDown={(e) => {
        if (e.key === "Tab" && menuRef.current) trapFocus(menuRef.current, e.nativeEvent);
      }}
    >
      <button type="button" onClick={onRename}>{t("menu.rename")}</button>
      <button type="button" onClick={onRestore} disabled={!hasOverride}>{t("menu.restoreTitle")}</button>
      <button type="button" onClick={onNew}>{onNewLabel}</button>
      {onSplit ? <button type="button" onClick={onSplit}>{splitLabel}</button> : null}
      {onFork ? <button type="button" onClick={onFork}>{t("menu.fork")}</button> : null}
      <button type="button" onClick={onDuplicate}>{t("menu.duplicate")}</button>
      {onMoveToProject ? <button type="button" onClick={onMoveToProject}>{t("menu.moveToProject")}</button> : null}
      <div className="sep" />
      {note ? (
        <p className="menu-note" data-tip={note}>
          {note}
        </p>
      ) : null}
      <button type="button" onClick={onEditNote}>{t("menu.note")}</button>
      {!isUnread ? (
        <button type="button" onClick={onMarkUnread}>{t("menu.markUnread")}</button>
      ) : null}
      <button type="button" onClick={onToggleMute}>
        {muted ? t("menu.unmute") : t("menu.mute")}
      </button>
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
  onNewSession,
  onReveal,
  onCopyPath,
  onRemove,
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
  onNewSession?: () => void;
  onReveal?: () => void;
  onCopyPath?: () => void;
  onRemove?: () => void;
  groups?: { id: string; name: string }[];
  currentGroupId?: string | null;
  onMoveToGroup?: (groupId: string) => void;
  onUngroup?: () => void;
  onCreateGroup?: () => void;
}) {
  const t = useT();
  return (
    <div className="menu" style={{ top, left }} role="menu">
      {onNewSession ? (
        <button type="button" onClick={onNewSession}>{t("sidebar.newProjectSession")}</button>
      ) : null}
      {onReveal ? <button type="button" onClick={onReveal}>{t("menu.reveal")}</button> : null}
      {onCopyPath ? <button type="button" onClick={onCopyPath}>{t("menu.copyCwd")}</button> : null}
      {onNewSession || onReveal || onCopyPath ? <div className="sep" /> : null}
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
      {onRemove ? <div className="sep" /> : null}
      {onRemove ? (
        <button type="button" className="danger" onClick={onRemove}>{t("menu.removeProject")}</button>
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
