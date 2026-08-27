import type { SessionSummary } from "../api";
import { IconChat, IconChevron, IconMore } from "../icons";
import { countDescendants, displayTitle, type SessionNode } from "../lib/projects";
import { shouldAutoExpand } from "../lib/session-chrome";
import { statusLabel, type SessionStatus } from "../lib/session-status";
import { formatTokenCount, type SidebarRow } from "../lib/sidebar-list";
import { DotMatrix } from "./DotMatrix";

function collectDescendantIds(node: SessionNode): string[] {
  const ids: string[] = [];
  for (const child of node.children) {
    ids.push(child.session.id, ...collectDescendantIds(child));
  }
  return ids;
}

export type SessionRowKind = "inbox" | "project";

function SessionLeading({
  status,
  rowKind,
  label,
}: {
  status: SessionStatus;
  rowKind: SessionRowKind;
  label: string;
}) {
  if (status === "working") {
    return <DotMatrix className="sess-matrix" aria-label={label} />;
  }

  const showChat = rowKind === "inbox";
  const showStatusDot = status !== "idle";

  if (showChat) {
    return (
      <>
        <IconChat size={12} className="sess-chat" />
        {showStatusDot ? (
          <span className={`sess-dot ${status}`} title={label} aria-label={label} role="img" />
        ) : null}
      </>
    );
  }

  if (showStatusDot) {
    return <span className={`sess-dot ${status}`} title={label} aria-label={label} role="img" />;
  }

  return null;
}

export type SessionBranchProps = {
  node: SessionNode;
  depth: number;
  rowKind: SessionRowKind;
  sessionId: string | null;
  splitId?: string;
  titles: Record<string, string>;
  expandedIds: Set<string>;
  collapsedIds: Set<string>;
  onToggleExpand: (id: string, currentlyOpen: boolean) => void;
  onOpen: (s: SessionSummary) => void;
  onMenu: (id: string, el: HTMLElement) => void;
  statusFor?: (id: string) => SessionStatus;
  subtitle?: string;
  token?: number;
  worktree?: string;
  showStatus?: boolean;
  showTokens?: boolean;
  projectPinned?: boolean;
  rowMeta?: Map<string, SidebarRow>;
};

export function SessionBranch({
  node,
  depth,
  rowKind,
  sessionId,
  splitId,
  titles,
  expandedIds,
  collapsedIds,
  onToggleExpand,
  onOpen,
  onMenu,
  statusFor,
  subtitle,
  token,
  worktree,
  showStatus = true,
  showTokens = false,
  projectPinned,
  rowMeta,
}: SessionBranchProps) {
  const s = node.session;
  const meta = rowMeta?.get(s.id);
  const rowSubtitle = meta?.subtitle ?? subtitle;
  const rowToken = meta?.token ?? token;
  const rowWorktree = meta?.worktree ?? worktree;
  const pinned = Boolean(projectPinned ?? meta?.projectPinned);
  const status = statusFor?.(s.id) ?? "idle";
  const label = statusLabel(status);
  const hasKids = node.children.length > 0;
  const descendantIds = hasKids ? collectDescendantIds(node) : [];
  const expanded =
    hasKids &&
    !collapsedIds.has(s.id) &&
    (expandedIds.has(s.id) || shouldAutoExpand(s.id, sessionId, descendantIds));
  const descCount = hasKids ? countDescendants(node) : 0;
  const leading =
    showStatus && (status === "working" || status !== "idle" || rowKind === "inbox") ? (
      <span className="sess-leading">
        <SessionLeading status={status} rowKind={rowKind} label={label} />
      </span>
    ) : null;
  const labeledSubtitle = rowSubtitle ? (pinned ? `★ ${rowSubtitle}` : rowSubtitle) : undefined;
  const subLine = [labeledSubtitle, rowWorktree].filter(Boolean).join(" · ");

  return (
    <>
      <div
        className={`session${depth ? " child" : ""} ${s.id === sessionId ? "active" : ""}${s.id === splitId ? " split-open" : ""}`}
      >
        {hasKids ? (
          <button
            type="button"
            className="branch-chev"
            aria-label={expanded ? "收起子会话" : "展开子会话"}
            aria-expanded={expanded}
            onClick={(e) => {
              e.stopPropagation();
              onToggleExpand(s.id, expanded);
            }}
          >
            <IconChevron size={9} />
          </button>
        ) : null}
        <button type="button" className="title" onClick={() => onOpen(s)}>
          {leading}
          <span className="sess-copy">
            <span className="sess-title">{displayTitle(s, titles)}</span>
            {subLine ? <span className="sess-sub">{subLine}</span> : null}
          </span>
        </button>
        {showTokens && rowToken !== undefined ? (
          <span className="sess-token">{formatTokenCount(rowToken)}</span>
        ) : null}
        {hasKids ? (
          <span
            className="count"
            style={{ fontSize: 11, color: "var(--faint)", minWidth: 12, textAlign: "right" }}
          >
            {descCount}
          </span>
        ) : null}
        <button
          type="button"
          className="more"
          data-menu-trigger
          aria-label="会话操作"
          onClick={(e) => {
            e.stopPropagation();
            onMenu(s.id, e.currentTarget);
          }}
        >
          <IconMore />
        </button>
      </div>
      {hasKids && expanded ? (
        <div className="session-kids">
          {node.children.map((child) => (
            <SessionBranch
              key={child.session.id}
              node={child}
              depth={depth + 1}
              rowKind={rowKind}
              sessionId={sessionId}
              splitId={splitId}
              titles={titles}
              expandedIds={expandedIds}
              collapsedIds={collapsedIds}
              onToggleExpand={onToggleExpand}
              onOpen={onOpen}
              onMenu={onMenu}
              statusFor={statusFor}
              showStatus={showStatus}
              showTokens={showTokens}
              projectPinned={projectPinned}
              rowMeta={rowMeta}
            />
          ))}
        </div>
      ) : null}
    </>
  );
}
