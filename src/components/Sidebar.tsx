import { useEffect, useMemo, useRef, useState, type KeyboardEvent, type MouseEvent as ReactMouseEvent } from "react";
import { beginWindowDrag, type SessionSearchHit, type SessionSummary } from "../api";
import { ProjectMenu, GroupMenu, menuPosition } from "../SessionMenu";
import { IconGrokMore, IconGrokPlus, IconGrokSearch, IconGrokSidebar } from "../grok-icons";
import { IconClose, IconFolder, IconFolderOpen, IconFolderPlus } from "../icons";
import { nestByParent } from "../lib/projects";
import { windowedProjectNodes } from "../lib/project-session-window";
import { dropTargetFromAttr, groupIdFor, parseGroupBandId, type ProjectGroup } from "../lib/project-groups";
import { dragStarted } from "../lib/pane-tree";
import { useT } from "../lib/locale-context";
import type { SessionStatus } from "../lib/session-status";
import {
  INBOX_PIN,
  SIDEBAR_BAND_LABEL,
  groupSidebarBands,
  isSidebarBandId,
  type SidebarListPrefs,
  type SidebarRow,
  type SidebarSection,
} from "../lib/sidebar-list";
import { sessionGlideMetrics } from "../lib/session-glide";
import { AccountMenu } from "./AccountMenu";
import { ShortcutKbd } from "./ShortcutHint";
import { sessionTreeNav } from "../lib/session-tree-keys";
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
  groups?: ProjectGroup[];
  groupMembership?: Record<string, string>;
  openGroups?: Record<string, boolean>;
  onToggleGroup?: (id: string) => void;
  onCreateGroup?: () => { id: string; name: string };
  onCreateGroupForProject?: (path: string) => { id: string; name: string };
  onMoveProjectToGroup?: (path: string, groupId: string | null) => void;
  onRenameGroup?: (id: string, name: string) => void;
  onDeleteGroup?: (id: string) => void;
  sessionId: string | null;
  openIds?: readonly string[];
  focusedId?: string | null;
  titles: Record<string, string>;
  expandedIds: Set<string>;
  collapsedIds: Set<string>;
  onToggleExpand: (id: string, currentlyOpen: boolean) => void;
  onOpenSession: (s: SessionSummary) => void;
  onSessionMenu: (id: string, el: HTMLElement, point?: { clientX: number; clientY: number }) => void;
  onNewChat: () => void;
  onNewProjectSession: (path: string) => void;
  onAddProject: () => void;
  picking: boolean;
  statusFor: (id: string) => SessionStatus;
  collapsed?: boolean;
  width?: number;
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
  onDragSession?: (e: import("react").PointerEvent<HTMLElement>, s: SessionSummary) => void;
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
  groups = [],
  groupMembership = {},
  openGroups = {},
  onToggleGroup,
  onCreateGroup,
  onCreateGroupForProject,
  onMoveProjectToGroup,
  onRenameGroup,
  onDeleteGroup,
  sessionId,
  openIds,
  focusedId,
  titles,
  expandedIds,
  collapsedIds,
  onToggleExpand,
  onOpenSession,
  onSessionMenu,
  onNewChat,
  onNewProjectSession,
  onAddProject,
  picking,
  statusFor,
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
  onDragSession,
}: SidebarProps) {
  const t = useT();
  const [projectMenu, setProjectMenu] = useState<{
    path: string;
    pinned: boolean;
    top: number;
    left: number;
  } | null>(null);
  const [groupMenu, setGroupMenu] = useState<{ id: string; top: number; left: number } | null>(null);
  const [editingGroupId, setEditingGroupId] = useState<string | null>(null);
  const [groupNameDraft, setGroupNameDraft] = useState("");
  const [dropOver, setDropOver] = useState<string | null>(null);
  const skipProjectToggle = useRef<string | null>(null);
  const [sessionPages, setSessionPages] = useState<Record<string, number>>({});
  const [selectedIds, setSelectedIds] = useState<string[]>([]);
  const anchorId = useRef<string | null>(null);
  const modsRef = useRef({ shift: false, meta: false });
  const lastClickedId = useRef<string | null>(null);

  function moveGlide(e: ReactMouseEvent<HTMLDivElement>) {
    const list = e.currentTarget;
    const item = (e.target as HTMLElement).closest(".session");
    if (!item || !(item instanceof HTMLElement) || !list.contains(item)) {
      list.classList.remove("gliding");
      return;
    }
    const { y, h } = sessionGlideMetrics(list, item);
    list.style.setProperty("--glide-y", `${y}px`);
    list.style.setProperty("--glide-h", `${h}px`);
    list.classList.add("gliding");
  }

  function hideGlide(e: ReactMouseEvent<HTMLDivElement>) {
    e.currentTarget.classList.remove("gliding");
  }

  useEffect(() => {
    if (!projectMenu && !groupMenu) return;
    const onDown = (e: MouseEvent) => {
      if (e.target instanceof Element && (e.target.closest(".menu") || e.target.closest("[data-menu-trigger]"))) return;
      setProjectMenu(null);
      setGroupMenu(null);
    };
    const onKey = (e: globalThis.KeyboardEvent) => {
      if (e.key === "Escape") {
        setProjectMenu(null);
        setGroupMenu(null);
      }
    };
    window.addEventListener("mousedown", onDown);
    window.addEventListener("keydown", onKey);
    return () => {
      window.removeEventListener("mousedown", onDown);
      window.removeEventListener("keydown", onKey);
    };
  }, [projectMenu, groupMenu]);

  function openProjectMenu(path: string, pinned: boolean, el: HTMLElement, point?: { clientX: number; clientY: number }) {
    setGroupMenu(null);
    setProjectMenu({ path, pinned, ...menuPosition(el, point) });
  }

  function commitGroupName(id: string) {
    const name = groupNameDraft.trim();
    if (name) onRenameGroup?.(id, name);
    setEditingGroupId(null);
  }

  function beginProjectDrag(e: { button: number; clientX: number; clientY: number }, path: string) {
    if (e.button !== 0 || !onMoveProjectToGroup) return;
    const startX = e.clientX;
    const startY = e.clientY;
    let started = false;
    const onMove = (ev: PointerEvent) => {
      if (!started && !dragStarted(ev.clientX - startX, ev.clientY - startY)) return;
      started = true;
      skipProjectToggle.current = path;
      const hit = ev.target instanceof Element ? ev.target.closest("[data-project-drop]") : null;
      setDropOver(hit?.getAttribute("data-project-drop") ?? null);
    };
    const onUp = (ev: PointerEvent) => {
      window.removeEventListener("pointermove", onMove);
      window.removeEventListener("pointerup", onUp);
      if (started) {
        const hit = ev.target instanceof Element ? ev.target.closest("[data-project-drop]") : null;
        const dest = dropTargetFromAttr(hit?.getAttribute("data-project-drop") ?? null);
        if (dest?.kind === "ungrouped") onMoveProjectToGroup(path, null);
        else if (dest?.kind === "group") onMoveProjectToGroup(path, dest.id);
      }
      setDropOver(null);
    };
    window.addEventListener("pointermove", onMove);
    window.addEventListener("pointerup", onUp);
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

  function onSessionTreeKeyDown(e: KeyboardEvent<HTMLElement>) {
    const head = e.target instanceof Element ? e.target.closest<HTMLButtonElement>(".project-head") : null;
    if (head && (e.key === "ArrowLeft" || e.key === "ArrowRight")) {
      const open = head.getAttribute("aria-expanded") === "true";
      if ((e.key === "ArrowLeft" && open) || (e.key === "ArrowRight" && !open)) {
        e.preventDefault();
        head.click();
      }
      return;
    }
    if (e.key === "Tab") {
      const groups = Array.from(e.currentTarget.querySelectorAll<HTMLElement>("[data-session-group]"));
      if (groups.length < 2) return;
      const current =
        e.target instanceof Element ? e.target.closest<HTMLElement>("[data-session-group]") : null;
      const i = current ? groups.indexOf(current) : -1;
      if (i < 0) return;
      const next = e.shiftKey ? i - 1 : i + 1;
      if (next < 0 || next >= groups.length) return;
      e.preventDefault();
      const stop = groups[next].querySelector<HTMLElement>(".project-head, [data-group-tab]");
      (stop ?? groups[next]).focus();
      return;
    }
    const rows = Array.from(
      e.currentTarget.querySelectorAll<HTMLButtonElement>(".session[data-session-row] button.title, button.session"),
    );
    if (rows.length === 0) return;
    const sessionRoot =
      e.target instanceof Element ? e.target.closest(".session[data-session-row], button.session") : null;
    const current =
      sessionRoot instanceof HTMLButtonElement
        ? sessionRoot
        : sessionRoot?.querySelector<HTMLButtonElement>("button.title") ?? null;
    const index = current ? rows.indexOf(current) : 0;
    const nav = sessionTreeNav(e.key, {
      index,
      count: rows.length,
      hasKids: sessionRoot instanceof HTMLElement && sessionRoot.dataset.hasKids === "1",
      expanded: sessionRoot instanceof HTMLElement && sessionRoot.dataset.expanded === "1",
    });
    if (!nav) return;
    e.preventDefault();
    if (nav.type === "toggle-expand") {
      const id = sessionRoot instanceof HTMLElement ? sessionRoot.dataset.sessionRow : undefined;
      if (id) onToggleExpand(id, sessionRoot instanceof HTMLElement && sessionRoot.dataset.expanded === "1");
      return;
    }
    rows[nav.index]?.focus();
  }

  const branchProps = {
    sessionId,
    openIds,
    focusedId,
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
    onDragSession,
  };

  function renderProject(section: SidebarSection) {
    const meta = rowMetaMap(section.rows);
    const path = section.projectPath ?? INBOX_PIN;
    const open = !!openProjects[path];
    const pinned = section.rows.some((row) => row.projectPinned) || section.band === "pin";
    const windowed = windowedProjectNodes(
      nestByParent(section.rows.map((row) => row.session)),
      sessionPages[path] ?? 0,
      sessionId,
    );
    return (
      <div
        key={section.id}
        className={`project ${open ? "open" : ""}`}
        role="listitem"
        aria-label={section.label}
        data-session-group
      >
        <div className="project-head-row">
          <button
            type="button"
            className="project-head"
            aria-expanded={open}
            onPointerDown={(e) => beginProjectDrag(e, path)}
            onClick={() => {
              if (skipProjectToggle.current === path) {
                skipProjectToggle.current = null;
                return;
              }
              onToggleProject(path);
            }}
            onContextMenu={(e) => {
              e.preventDefault();
              e.stopPropagation();
              openProjectMenu(path, pinned, e.currentTarget, { clientX: e.clientX, clientY: e.clientY });
            }}
          >
            <span className="folder-glyph" aria-hidden>
              {open ? <IconFolderOpen size={16} /> : <IconFolder size={16} />}
            </span>
            <span className="pname" data-tip={section.projectPath ?? section.label}>
              {section.label}
            </span>
          </button>
          <button
            type="button"
            className="project-new"
            aria-label={t("sidebar.newProjectSession")}
            data-tip={t("sidebar.newProjectSession")}
            onClick={(e) => {
              e.stopPropagation();
              onNewProjectSession(path);
            }}
          >
            <IconGrokPlus size={16} />
          </button>
          <button
            type="button"
            className="more"
            data-menu-trigger
            aria-label={t("sidebar.projectActions")}
            data-tip={t("sidebar.projectActions")}
            onClick={(e) => {
              e.stopPropagation();
              openProjectMenu(path, pinned, e.currentTarget);
            }}
          >
            <IconGrokMore size={16} />
          </button>
        </div>
        <div className={`project-sessions${open ? " open" : ""}`}>
          <div className="project-sessions-inner" inert={!open}>
            <div className={`project-sessions-clip${windowed.hasMore ? " is-clipped" : ""}`}>
              {windowed.nodes.map((node) => (
                <SessionBranch
                  key={node.session.id}
                  node={node}
                  depth={0}
                  rowKind="project"
                  rowMeta={meta}
                  {...branchProps}
                  hideProjectSubtitle
                />
              ))}
            </div>
            {windowed.hasMore ? (
              <button
                type="button"
                className="project-session-more"
                onClick={(e) => {
                  e.stopPropagation();
                  setSessionPages((prev) => ({ ...prev, [path]: (prev[path] ?? 0) + 1 }));
                }}
              >
                {t("sidebar.showMoreSessions")}
              </button>
            ) : null}
          </div>
        </div>
      </div>
    );
  }

  return (
    <aside className={`sidebar${collapsed ? " rail" : ""}`}>
      <div className="side-traffic">
        <div
          className="side-traffic-drag"
          data-tauri-drag-region
          onPointerDown={(e) => {
            if (e.button !== 0) return;
            beginWindowDrag();
          }}
        />
        {collapsed ? null : (
          <div className="side-actions">
            <button
              type="button"
              className="icon-btn shortcut-host"
              aria-label={t("sidebar.search")}
              data-tip={t("sidebar.search")}
              onClick={onSearch}
            >
              <IconGrokSearch size={18} />
              <ShortcutKbd id="palette" />
            </button>
            {onToggleCollapsed ? (
              <button
                type="button"
                className="icon-btn"
                aria-label={t("sidebar.collapse")}
                data-tip={t("sidebar.collapse")}
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
              aria-label={t("sidebar.expand")}
              data-tip={t("sidebar.expand")}
              onClick={onToggleCollapsed}
            >
              <IconGrokSidebar size={18} />
            </button>
          ) : null}
          <button type="button" className="icon-btn shortcut-host" aria-label={t("sidebar.search")} data-tip={t("sidebar.search")} onClick={onSearch}>
            <IconGrokSearch size={18} />
            <ShortcutKbd id="palette" />
          </button>
          <button type="button" className="icon-btn shortcut-host" aria-label={t("sidebar.newChat")} data-tip={t("sidebar.newChat")} onClick={onNewChat}>
            <IconGrokPlus size={18} />
            <ShortcutKbd id="new-chat" />
          </button>
        </div>
      ) : null}

      <div className="side-content">
        <button type="button" className="new-task new-chat shortcut-host" onClick={onNewChat}>
          <IconGrokPlus size={18} />
          {t("sidebar.newChat")}
          <ShortcutKbd id="new-chat" />
        </button>
      </div>

      {searchHits !== null ? (
        <div
          className="session-list inbox-list"
          style={{ flex: "0 0 auto", maxHeight: 160 }}
          onMouseOver={moveGlide}
          onMouseLeave={hideGlide}
        >
          <span className="session-glide" aria-hidden="true" />
          <div className="section-label ws-hits">
            {t("sidebar.searchResults")}
            <button type="button" className="icon-btn" onClick={onClearHits} aria-label={t("sidebar.clearSearch")} data-tip={t("sidebar.clear")}>
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
        {t("sidebar.workspace")}
        <span className="ws-head-actions">
          <button
            type="button"
            className="icon-btn"
            data-tip={picking ? t("sidebar.pickingFolder") : t("sidebar.addProject")}
            aria-label={picking ? t("sidebar.pickingFolder") : t("sidebar.addProject")}
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
            onCreateGroup={
              onCreateGroup && prefs.grouping === "project"
                ? () => {
                    const made = onCreateGroup();
                    setEditingGroupId(made.id);
                    setGroupNameDraft(made.name);
                  }
                : undefined
            }
          />
        </span>
      </div>

      {selectedIds.length > 0 ? (
        <div className="session-batch" role="toolbar" aria-label={t("sidebar.batch")}>
          <span className="hint">{t("sidebar.selected", { n: selectedIds.length })}</span>
          <button
            type="button"
            className="btn"
            disabled={!onMarkReadSessions}
            onClick={() => {
              onMarkReadSessions?.(selectedIds);
              clearSelection();
            }}
          >
            {t("sidebar.markRead")}
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
            {t("sidebar.archive")}
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
            {t("hub.delete")}
          </button>
          <button type="button" className="icon-btn" onClick={clearSelection} aria-label={t("sidebar.deselect")}>
            {t("sidebar.cancel")}
          </button>
        </div>
      ) : null}

      <div
        className={`session-list${selectedIds.length ? " is-batching" : ""}`}
        role="list"
        aria-label={t("sidebar.sessions")}
        onKeyDown={onSessionTreeKeyDown}
        onMouseOver={moveGlide}
        onMouseLeave={hideGlide}
        onDoubleClick={(e) => {
          const target = e.target;
          if (!(target instanceof Element)) return;
          if (!target.closest(".sess-title, .session .title")) return;
          const id = lastClickedId.current;
          if (id) onStartRename?.(id);
        }}
      >
        <span className="session-glide" aria-hidden="true" />
        {sections.length === 0 ? (
          <p className="footnote">{t("sidebar.empty")}</p>
        ) : null}
        {groupSidebarBands(sections).map((band) => {
          const labeled = isSidebarBandId(band.id);
          const groupId = parseGroupBandId(band.id);
          const groupOpen = groupId ? openGroups[groupId] !== false : true;
          const dropAttr = groupId ? `group:${groupId}` : undefined;
          const ungroupDrop = band.id === "projects";
          const bandClass = [
            labeled || groupId ? `ws-band ws-band-${labeled ? band.id : "group"}` : "",
            dropOver && dropAttr === dropOver ? "is-drop" : "",
          ]
            .filter(Boolean)
            .join(" ");
          return (
            <div
              key={band.id}
              className={bandClass || undefined}
              data-project-drop={dropAttr}
            >
              {groupId ? (
                <div className="group-head-row">
                  <button
                    type="button"
                    className="group-head"
                    aria-expanded={groupOpen}
                    onClick={() => onToggleGroup?.(groupId)}
                    onContextMenu={(e) => {
                      e.preventDefault();
                      e.stopPropagation();
                      setProjectMenu(null);
                      setGroupMenu({ id: groupId, ...menuPosition(e.currentTarget, { clientX: e.clientX, clientY: e.clientY }) });
                    }}
                  >
                    {editingGroupId === groupId ? (
                      <input
                        className="group-name-input"
                        value={groupNameDraft}
                        autoFocus
                        onChange={(e) => setGroupNameDraft(e.target.value)}
                        onBlur={() => commitGroupName(groupId)}
                        onClick={(e) => e.stopPropagation()}
                        onKeyDown={(e) => {
                          if (e.key === "Enter") {
                            e.preventDefault();
                            commitGroupName(groupId);
                          }
                          if (e.key === "Escape") setEditingGroupId(null);
                        }}
                      />
                    ) : (
                      <span className="gname">{band.label}</span>
                    )}
                  </button>
                  <button
                    type="button"
                    className="more"
                    data-menu-trigger
                    aria-label={t("sidebar.groupActions")}
                    data-tip={t("sidebar.groupActions")}
                    onClick={(e) => {
                      e.stopPropagation();
                      setProjectMenu(null);
                      setGroupMenu({ id: groupId, ...menuPosition(e.currentTarget) });
                    }}
                  >
                    <IconGrokMore size={16} />
                  </button>
                </div>
              ) : labeled ? (
                <div
                  className={`ws-band-label${dropOver === "ungrouped" && ungroupDrop ? " is-drop" : ""}`}
                  tabIndex={0}
                  data-group-tab
                  data-project-drop={ungroupDrop ? "ungrouped" : undefined}
                >
                  {t(`sidebar.${band.id}`)}
                </div>
              ) : null}
              <div className={groupId ? `group-projects${groupOpen ? " open" : ""}` : undefined}>
                <div className={groupId ? "group-projects-inner" : undefined} inert={groupId ? !groupOpen : undefined}>
              {band.sections.map((section) => {
          const meta = rowMetaMap(section.rows);
          if (section.kind === "group") return null;
          if (section.kind === "project") {
            return renderProject(section);
          }

          const inbox = section.kind === "inbox";
          return (
            <div
              key={section.id}
              className="ws-section"
              role="listitem"
              aria-label={section.label}
              data-session-group
            >
              {labeled || groupId ? null : (
                <div
                  className={section.kind === "pin" ? "pin-label" : "section-label"}
                  tabIndex={0}
                  data-group-tab
                >
                  {section.label}
                </div>
              )}
              {inbox
                ? nestByParent(section.rows.map((row) => row.session)).map((node) => (
                    <SessionBranch
                      key={node.session.id}
                      node={node}
                      depth={0}
                      rowKind="inbox"
                      rowMeta={meta}
                      {...branchProps}
                      hideProjectSubtitle
                    />
                  ))
                : section.rows.map((row) => (
                    <SessionBranch
                      key={row.session.id}
                      node={{ session: row.session, children: [] }}
                      depth={row.indent}
                      rowKind={row.subtitle === SIDEBAR_BAND_LABEL.inbox ? "inbox" : "project"}
                      projectPinned={row.projectPinned}
                      rowMeta={meta}
                      {...branchProps}
                    />
                  ))}
            </div>
          );
              })}
                </div>
              </div>
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
          groups={groups}
          currentGroupId={groupIdFor({ groups, membership: groupMembership }, projectMenu.path) ?? null}
          onPin={() => {
            onPinProject(projectMenu.path);
            setProjectMenu(null);
          }}
          onMoveToGroup={(groupId) => {
            onMoveProjectToGroup?.(projectMenu.path, groupId);
            setProjectMenu(null);
          }}
          onUngroup={() => {
            onMoveProjectToGroup?.(projectMenu.path, null);
            setProjectMenu(null);
          }}
          onCreateGroup={
            onCreateGroupForProject
              ? () => {
                  const made = onCreateGroupForProject(projectMenu.path);
                  setEditingGroupId(made.id);
                  setGroupNameDraft(made.name);
                  setProjectMenu(null);
                }
              : undefined
          }
        />
      ) : null}
      {groupMenu ? (
        <GroupMenu
          top={groupMenu.top}
          left={groupMenu.left}
          onRename={() => {
            const group = groups.find((g) => g.id === groupMenu.id);
            setEditingGroupId(groupMenu.id);
            setGroupNameDraft(group?.name ?? "");
            setGroupMenu(null);
          }}
          onDelete={() => {
            onDeleteGroup?.(groupMenu.id);
            setGroupMenu(null);
          }}
        />
      ) : null}
    </aside>
  );
}
