import type { SessionSearchHit, SessionSummary } from "../api";
import { IconChevron, IconFolder, IconFolderOpen, IconPlus, IconSearch } from "../icons";
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
  onSessionMenu: (id: string, el: HTMLElement) => void;
  onNewChat: () => void;
  onAddProject: () => void;
  picking: boolean;
  statusFor: (id: string) => SessionStatus;
  width: number;
  collapsed?: boolean;
  onToggleCollapsed?: () => void;
  signedIn: boolean;
  onSettings: () => void;
  onExtensions: () => void;
  onShortcuts: () => void;
  onCollapseAll: () => void;
  onMarkAllRead: () => void;
  showTokens: boolean;
  showStatus: boolean;
  showWorktree: boolean;
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
  onSettings,
  onExtensions,
  onShortcuts,
  onCollapseAll,
  onMarkAllRead,
  showTokens,
  showStatus,
}: SidebarProps) {
  const branchProps = {
    sessionId,
    splitId,
    titles,
    expandedIds,
    collapsedIds,
    onToggleExpand,
    onOpen: onOpenSession,
    onMenu: onSessionMenu,
    statusFor,
    showStatus,
    showTokens,
  };

  return (
    <aside className={`sidebar${collapsed ? " rail" : ""}`} style={{ width }}>
      <div className="side-traffic" data-tauri-drag-region>
        <div className="side-actions">
          {onToggleCollapsed ? (
            <button
              type="button"
              className="icon-btn"
              aria-label={collapsed ? "展开侧栏" : "折叠侧栏"}
              title={collapsed ? "展开侧栏" : "折叠侧栏"}
              onClick={onToggleCollapsed}
            >
              <IconChevron size={14} />
            </button>
          ) : null}
        </div>
      </div>

      {collapsed ? (
        <button type="button" className="icon-btn rail-new" aria-label="新对话" title="新对话" onClick={onNewChat}>
          <IconPlus size={16} />
        </button>
      ) : null}

      <div className="side-content">
        <button type="button" className="new-task new-chat" onClick={onNewChat}>
          <IconPlus size={16} />
          新对话
        </button>
        <button type="button" className="new-task new-chat" onClick={onSearch}>
          <IconSearch size={16} />
          搜索
        </button>
      </div>

      {searchHits !== null ? (
        <div className="session-list inbox-list" style={{ flex: "0 0 auto", maxHeight: 160 }}>
          <div className="section-label ws-hits">
            搜索结果
            <button type="button" className="icon-btn" onClick={onClearHits} aria-label="清除搜索结果" title="清除">
              清除
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
        <SidebarListMenu
          prefs={prefs}
          onPrefs={onPrefs}
          onCollapseAll={onCollapseAll}
          onMarkAllRead={onMarkAllRead}
        />
      </div>

      <div className="session-list">
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
                    className="icon-btn pin-project"
                    aria-label={pinned ? "取消置顶" : "置顶项目"}
                    title={pinned ? "取消置顶" : "置顶项目"}
                    aria-pressed={pinned}
                    onClick={() => onPinProject(path)}
                  >
                    {pinned ? "★" : "☆"}
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

      <div className="side-add">
        <button
          type="button"
          className="icon-btn"
          title={picking ? "选择文件夹…" : "添加项目"}
          aria-label={picking ? "选择文件夹…" : "添加项目"}
          disabled={picking}
          onClick={onAddProject}
        >
          <IconPlus size={14} />
        </button>
      </div>

      <AccountMenu
        signedIn={signedIn}
        onSettings={onSettings}
        onExtensions={onExtensions}
        onShortcuts={onShortcuts}
      />
    </aside>
  );
}
