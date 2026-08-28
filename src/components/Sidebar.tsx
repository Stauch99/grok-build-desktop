import { useEffect, useMemo, useRef, useState } from "react";
import type { SessionSearchHit, SessionSummary } from "../api";
import { ProjectMenu, menuPosition } from "../SessionMenu";
import { IconGrokMore, IconGrokPlus, IconGrokSearch, IconGrokSidebar } from "../grok-icons";
import { IconClose, IconFolder, IconFolderOpen, IconFolderPlus } from "../icons";
import { nestByParent } from "../lib/projects";
import type { SessionStatus } from "../lib/session-status";
import {
  INBOX_PIN,
  type SidebarListPrefs,
  type SidebarRow,
  type SidebarSection,
} from "../lib/sidebar-list";
import { AccountMenu } from "./AccountMenu";
import { SessionBranch } from "./SessionBranch";
import { SidebarListMenu } from "./SidebarListMenu";
import type { WeeklyUsage } from "../lib/weekly-usage";

export type SidebarProps = {
  sections: SidebarSection[];
  prefs: SidebarListPrefs;
  onPrefs: (next: SidebarListPrefs) => void;
  onSearch: () => void;
  searchHits: SessionSearchHit[] | null;
  onOpenHit: (sessionId: string) => void;
  onClearHits: () => void;
  openProjects: Record<string, boolean>;
  onToggleProject: (path: string) => void;
  onPinProject: (path: string) => void;
  sessionId: string | null;
  splitId?: string;
  titles: Record<string, string>;
  expandedIds: Set<string>;
  collapsedIds: Set<string>;
  onToggleExpand: (id: string, currentlyOpen: boolean) => void;
  onOpenSession: (s: SessionSummary) => void;
  onSessionMenu: (id: string, el: HTMLElement, point?: { clientX: number; clientY: number }) => void;
  onNewChat: () => void;
  onAddProject: () => void;
  picking: boolean;
  statusFor: (id: string) => SessionStatus;
  width: number;
  collapsed?: boolean;
  onToggleCollapsed?: () => void;
  signedIn: boolean;
  weeklyUsage?: WeeklyUsage | null;
  onSettings: () => void;
  onExtensions: () => void;
  onShortcuts: () => void;
  onCollapseAll: () => void;
  onMarkAllRead: () => void;
  showTokens: boolean;
  showStatus: boolean;
  showWorktree: boolean;
  /** First-user-message preview map for untitled sessions. */
  preview?: Record<string, string>;
  onStartRename?: (id: string) => void;
  onDeleteSessions?: (ids: string[]) => void;
  onMarkReadSessions?: (ids: string[]) => void;
  onArchiveSessions?: (ids: string[]) => void;
};

function rowMetaMap(rows: SidebarRow[]): Map<string, SidebarRow> {
  return new Map(rows.map((row) => [row.session.id, row]));
}

/**
 * Navigate: which project, which session. Everything that configures the
 * agent lives in Settings, not here.
 */
export function Sidebar({
  sections,
  prefs,
  onPrefs,
  onSearch,
  searchHits,
  onOpenHit,
  onClearHits,
  openProjects,
  onToggleProject,
  onPinProject,
  sessionId,
  splitId,
  titles,
  expandedIds,
  collapsedIds,
  onToggleExpand,
  onOpenSession,
  onSessionMenu,
  onNewChat,
  onAddProject,
  picking,
  statusFor,
  width,
  collapsed = false,
  onToggleCollapsed,
  signedIn,
  weeklyUsage = null,
  onSettings,
  onExtensions,
  onShortcuts,
  onCollapseAll,
  onMarkAllRead,
  showTokens,
  showStatus,
  preview,
  onStartRename,
  onDeleteSessions,
  onMarkReadSessions,
  onArchiveSessions,
}: SidebarProps) {
  const [projectMenu, setProjectMenu] = useState<{
    path: string;
    pinned: boolean;
    top: number;
    left: number;
  } | null>(null);
  const [selectedIds, setSelectedIds] = useState<string[]>([]);
  const anchorId = useRef<string | null>(null);
  const modsRef = useRef({ shift: false, meta: false });
  const lastClickedId = useRef<string | null>(null);

  useEffect(() => {
    if (!projectMenu) return;
    const onDown = (e: MouseEvent) => {
      if (e.target instanceof Element && (e.target.closest(".menu") || e.target.closest("[data-menu-trigger]"))) return;
      setProjectMenu(null);
    };
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") setProjectMenu(null);
    };
    window.addEventListener("mousedown", onDown);
    window.addEventListener("keydown", onKey);
    return () => {
      window.removeEventListener("mousedown", onDown);
      window.removeEventListener("keydown", onKey);
    };
  }, [projectMenu]);

  function openProjectMenu(path: string, pinned: boolean, el: HTMLElement, point?: { clientX: number; clientY: number }) {
    setProjectMenu({ path, pinned, ...menuPosition(el, point) });
  }

  const orderedIds = useMemo(
    () => sections.flatMap((section) => section.rows.map((row) => row.session.id)),
    [sections],
  );

  const displayTitles = useMemo(() => {
    if (!preview) return titles;
    const next = { ...titles };
    for (const section of sections) {
      for (const row of section.rows) {
        const s = row.session;
        if (titles[s.id]?.trim() || s.title.trim()) continue;
        const clip = preview[s.id]?.replace(/\s+/g, " ").trim().slice(0, 40);
        if (clip) next[s.id] = clip;
      }
    }
    return next;
  }, [titles, preview, sections]);

  useEffect(() => {
    const onDown = (e: MouseEvent) => {
      modsRef.current = { shift: e.shiftKey, meta: e.metaKey || e.ctrlKey };
    };
    window.addEventListener("mousedown", onDown, true);
    return () => window.removeEventListener("mousedown", onDown, true);
  }, []);

  function applySelection(id: string) {
    const { shift, meta } = modsRef.current;
    if (shift && anchorId.current) {
      const a = orderedIds.indexOf(anchorId.current);
      const b = orderedIds.indexOf(id);
      if (a >= 0 && b >= 0) {
        const [lo, hi] = a < b ? [a, b] : [b, a];
        setSelectedIds(orderedIds.slice(lo, hi + 1));
        return;
      }
    }
    if (meta) {
      setSelectedIds((prev) => (prev.includes(id) ? prev.filter((x) => x !== id) : [...prev, id]));
      anchorId.current = id;
      return;
    }
    setSelectedIds([id]);
    anchorId.current = id;
  }

  function clearSelection() {
    setSelectedIds([]);
    anchorId.current = null;
  }

  const branchProps = {
    sessionId,
    splitId,
    titles: displayTitles,
    expandedIds,
    collapsedIds,
    onToggleExpand,
    onOpen: (s: SessionSummary) => {
      lastClickedId.current = s.id;
      const { shift, meta } = modsRef.current;
      if (shift || meta) {
        applySelection(s.id);
        return;
      }
      clearSelection();
      onOpenSession(s);
    },
    onMenu: (id: string, el: HTMLElement, point?: { clientX: number; clientY: number }) => {
      setProjectMenu(null);
      onSessionMenu(id, el, point);
    },
    statusFor,
    showStatus,
    showTokens,
  };

  return (
    <aside className={`sidebar${collapsed ? " rail" : ""}`} style={{ width }}>
      <div className="side-traffic" data-tauri-drag-region>
        {collapsed ? null : (
          <div className="side-actions">
            <button
              type="button"
              className="icon-btn"
              aria-label="搜索"
              title="搜索"
              onClick={onSearch}
            >
              <IconGrokSearch size={18} />
            </button>
            {onToggleCollapsed ? (
              <button
                type="button"
                className="icon-btn"
                aria-label="折叠侧栏"
                title="折叠侧栏"
                onClick={onToggleCollapsed}
              >
                <IconGrokSidebar size={18} />
              </button>
            ) : null}
          </div>
        )}
      </div>

      {collapsed ? (
        <div className="rail-stack">
          {onToggleCollapsed ? (
            <button
              type="button"
              className="icon-btn"
              aria-label="展开侧栏"
              title="展开侧栏"
              onClick={onToggleCollapsed}
            >
              <IconGrokSidebar size={18} />
            </button>
          ) : null}
          <button type="button" className="icon-btn" aria-label="搜索" title="搜索" onClick={onSearch}>
            <IconGrokSearch size={18} />
          </button>
          <button type="button" className="icon-btn" aria-label="新对话" title="新对话" onClick={onNewChat}>
            <IconGrokPlus size={18} />
          </button>
        </div>
      ) : null}

      <div className="side-content">
        <button type="button" className="new-task new-chat" onClick={onNewChat}>
          <IconGrokPlus size={18} />
          新对话
        </button>
      </div>

      {searchHits !== null ? (
        <div className="session-list inbox-list" style={{ flex: "0 0 auto", maxHeight: 160 }}>
          <div className="section-label ws-hits">
            搜索结果
            <button type="button" className="icon-btn" onClick={onClearHits} aria-label="清除搜索结果" title="清除">
              <IconClose size={16} />
            </button>
          </div>
          {searchHits.map((hit) => (
            <button
              key={`${hit.sessionId}-${hit.snippet}`}
              type="button"
              className="session"
              onClick={() => onOpenHit(hit.sessionId)}
            >
              <span className="title">{hit.title}</span>
            </button>
          ))}
        </div>
      ) : null}

      <div className="section-label ws-head">
        工作区
        <span className="ws-head-actions">
          <button
            type="button"
            className="icon-btn"
            title={picking ? "选择文件夹…" : "添加项目"}
            aria-label={picking ? "选择文件夹…" : "添加项目"}
            disabled={picking}
            onClick={onAddProject}
          >
            <IconFolderPlus size={14} />
          </button>
          <SidebarListMenu
            prefs={prefs}
            onPrefs={onPrefs}
            onCollapseAll={onCollapseAll}
            onMarkAllRead={onMarkAllRead}
          />
        </span>
      </div>

      {selectedIds.length > 0 ? (
        <div className="session-batch" role="toolbar" aria-label="批量操作">
          <span className="hint">已选 {selectedIds.length}</span>
          <button
            type="button"
            className="btn"
            disabled={!onMarkReadSessions}
            onClick={() => {
              onMarkReadSessions?.(selectedIds);
              clearSelection();
            }}
          >
            标为已读
          </button>
          <button
            type="button"
            className="btn"
            disabled={!onArchiveSessions}
            onClick={() => {
              onArchiveSessions?.(selectedIds);
              clearSelection();
            }}
          >
            归档
          </button>
          <button
            type="button"
            className="btn"
            disabled={!onDeleteSessions}
            onClick={() => {
              onDeleteSessions?.(selectedIds);
              clearSelection();
            }}
          >
            删除
          </button>
          <button type="button" className="icon-btn" onClick={clearSelection} aria-label="取消选择">
            取消
          </button>
        </div>
      ) : null}

      <div
        className={`session-list${selectedIds.length ? " is-batching" : ""}`}
        onDoubleClick={(e) => {
          const target = e.target;
          if (!(target instanceof Element)) return;
          if (!target.closest(".sess-title, .session .title")) return;
          const id = lastClickedId.current;
          if (id) onStartRename?.(id);
        }}
      >
        {sections.length === 0 ? (
          <p className="footnote">没有符合筛选的会话</p>
        ) : null}
        {sections.map((section) => {
          const meta = rowMetaMap(section.rows);
          if (section.kind === "project") {
            const path = section.projectPath ?? INBOX_PIN;
            const open = !!openProjects[path];
            const pinned = section.rows.some((row) => row.projectPinned);
            const rowKind = path === INBOX_PIN ? "inbox" : "project";
            return (
              <div key={section.id} className={`project ${open ? "open" : ""}`}>
                <div className="project-head-row">
                  <button
                    type="button"
                    className="project-head"
                    aria-expanded={open}
                    onClick={() => onToggleProject(path)}
                    onContextMenu={(e) => {
                      e.preventDefault();
                      e.stopPropagation();
                      openProjectMenu(path, pinned, e.currentTarget, { clientX: e.clientX, clientY: e.clientY });
                    }}
                  >
                    <span className="folder-glyph" aria-hidden>
                      {open ? <IconFolderOpen size={16} /> : <IconFolder size={16} />}
                    </span>
                    <span className="pname" title={section.projectPath ?? section.label}>
                      {section.label}
                    </span>
                  </button>
                  <button
                    type="button"
                    className="more"
                    data-menu-trigger
                    aria-label="项目操作"
                    title="项目操作"
                    onClick={(e) => {
                      e.stopPropagation();
                      openProjectMenu(path, pinned, e.currentTarget);
                    }}
                  >
                    <IconGrokMore size={16} />
                  </button>
                </div>
                {open ? (
                  <div className="project-sessions">
                    {nestByParent(section.rows.map((row) => row.session)).map((node) => (
                      <SessionBranch
                        key={node.session.id}
                        node={node}
                        depth={0}
                        rowKind={rowKind}
                        rowMeta={meta}
                        {...branchProps}
                        hideProjectSubtitle
                      />
                    ))}
                  </div>
                ) : null}
              </div>
            );
          }

          return (
            <div key={section.id} className="ws-section">
              <div className={section.kind === "pin" ? "pin-label" : "section-label"}>{section.label}</div>
              {section.rows.map((row) => (
                <SessionBranch
                  key={row.session.id}
                  node={{ session: row.session, children: [] }}
                  depth={row.indent}
                  rowKind={row.subtitle === "独立对话" ? "inbox" : "project"}
                  projectPinned={row.projectPinned}
                  rowMeta={meta}
                  {...branchProps}
                />
              ))}
            </div>
          );
        })}
      </div>

      <AccountMenu
        signedIn={signedIn}
        weeklyUsage={weeklyUsage}
        compact={collapsed}
        onSettings={onSettings}
        onExtensions={onExtensions}
        onShortcuts={onShortcuts}
      />
      {projectMenu ? (
        <ProjectMenu
          top={projectMenu.top}
          left={projectMenu.left}
          pinned={projectMenu.pinned}
          onPin={() => {
            onPinProject(projectMenu.path);
            setProjectMenu(null);
          }}
        />
      ) : null}
    </aside>
  );
}
