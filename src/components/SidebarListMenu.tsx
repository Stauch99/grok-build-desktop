import { useEffect, useRef, useState, type ReactNode } from "react";
import { IconCheck, IconChevron, IconFilter } from "../icons";
import { useT } from "../lib/locale-context";
import {
  applyGrouping,
  toggleShow,
  toggleStatusFilter,
  type SidebarGrouping,
  type SidebarListPrefs,
  type SidebarOrdering,
  type StatusFilter,
} from "../lib/sidebar-list";

export type SidebarListMenuProps = {
  prefs: SidebarListPrefs;
  onPrefs: (next: SidebarListPrefs) => void;
  onCollapseAll: () => void;
  onMarkAllRead: () => void;
};

type Sub = "group" | "sort" | "show" | "filter";

function groupingItems(t: (key: string) => string): { value: SidebarGrouping; label: string }[] {
  return [
    { value: "project", label: t("sidebar.groupProject") },
    { value: "updated", label: t("sidebar.groupUpdated") },
    { value: "status", label: t("sidebar.groupStatus") },
  ];
}

function orderItems(t: (key: string) => string): { value: SidebarOrdering; label: string }[] {
  return [
    { value: "updated", label: t("sidebar.sortUpdated") },
    { value: "title", label: t("sidebar.sortTitle") },
  ];
}

function showItems(t: (key: string) => string): { key: "showTokens" | "showStatus" | "showWorktree"; label: string }[] {
  return [
    { key: "showTokens", label: "Token" },
    { key: "showStatus", label: t("sidebar.showStatus") },
    { key: "showWorktree", label: t("sidebar.showWorktree") },
  ];
}

function filterItems(t: (key: string) => string): { value: StatusFilter; label: string }[] {
  return [
    { value: "needs-you", label: t("sidebar.needsYou") },
    { value: "unread", label: t("sidebar.unread") },
    { value: "working", label: t("sidebar.working") },
    { value: "done", label: t("sidebar.done") },
  ];
}

function Check({ on }: { on: boolean }) {
  return on ? <IconCheck size={12} /> : <span className="menu-check-gap" />;
}

function listMenuPosition(el: HTMLElement): { top: number; left: number } {
  const r = el.getBoundingClientRect();
  const width = 176;
  return {
    left: Math.min(window.innerWidth - width - 8, Math.max(8, r.right - width)),
    top: Math.min(window.innerHeight - 400, r.bottom + 4),
  };
}

function FlyoutItem({
  label,
  open,
  onOpen,
  onLeave,
  children,
}: {
  label: string;
  open: boolean;
  onOpen: () => void;
  onLeave: () => void;
  children: ReactNode;
}) {
  return (
    <div className="list-menu-item" onMouseEnter={onOpen} onMouseLeave={onLeave}>
      <button
        type="button"
        role="menuitem"
        aria-haspopup="menu"
        aria-expanded={open}
        onClick={onOpen}
        onFocus={onOpen}
      >
        {label}
        <IconChevron size={11} />
      </button>
      {open ? (
        <div className="list-flyout" role="menu" onMouseEnter={onOpen} onMouseLeave={onLeave}>
          {children}
        </div>
      ) : null}
    </div>
  );
}

export function SidebarListMenu({ prefs, onPrefs, onCollapseAll, onMarkAllRead }: SidebarListMenuProps) {
  const t = useT();
  const [open, setOpen] = useState(false);
  const [sub, setSub] = useState<Sub | null>(null);
  const [pos, setPos] = useState<{ top: number; left: number } | null>(null);
  const wrapRef = useRef<HTMLDivElement>(null);
  const btnRef = useRef<HTMLButtonElement>(null);
  const leaveTimer = useRef<number>(0);

  useEffect(() => () => window.clearTimeout(leaveTimer.current), []);

  useEffect(() => {
    if (!open) {
      setSub(null);
      return;
    }
    const onDown = (e: MouseEvent) => {
      if (e.target instanceof Node && wrapRef.current?.contains(e.target)) return;
      setOpen(false);
    };
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") {
        if (sub) setSub(null);
        else setOpen(false);
      }
    };
    const onReposition = () => {
      if (btnRef.current) setPos(listMenuPosition(btnRef.current));
    };
    window.addEventListener("mousedown", onDown);
    window.addEventListener("keydown", onKey);
    window.addEventListener("resize", onReposition);
    return () => {
      window.removeEventListener("mousedown", onDown);
      window.removeEventListener("keydown", onKey);
      window.removeEventListener("resize", onReposition);
    };
  }, [open, sub]);

  function openSub(next: Sub) {
    window.clearTimeout(leaveTimer.current);
    setSub(next);
  }

  function leaveSub() {
    window.clearTimeout(leaveTimer.current);
    leaveTimer.current = window.setTimeout(() => setSub(null), 140);
  }

  function runAction(fn: () => void) {
    setOpen(false);
    fn();
  }

  function toggleOpen() {
    setOpen((was) => {
      if (was) return false;
      if (btnRef.current) setPos(listMenuPosition(btnRef.current));
      return true;
    });
  }

  return (
    <div className="list-menu-wrap" ref={wrapRef}>
      <button
        ref={btnRef}
        type="button"
        className="icon-btn"
        aria-label={t("sidebar.filter")}
        title={t("sidebar.filter")}
        aria-haspopup="menu"
        aria-expanded={open}
        onClick={toggleOpen}
      >
        <IconFilter size={14} />
      </button>
      {open && pos ? (
        <div className="menu list-menu" role="menu" style={{ top: pos.top, left: pos.left }}>
          <FlyoutItem label={t("sidebar.groupBy")} open={sub === "group"} onOpen={() => openSub("group")} onLeave={leaveSub}>
            {groupingItems(t).map((item) => (
              <button
                key={item.value}
                type="button"
                role="menuitemradio"
                aria-checked={prefs.grouping === item.value}
                onClick={() => onPrefs(applyGrouping(prefs, item.value))}
              >
                <span className="mode-row">
                  <span>{item.label}</span>
                  <Check on={prefs.grouping === item.value} />
                </span>
              </button>
            ))}
          </FlyoutItem>
          <FlyoutItem label={t("sidebar.sort")} open={sub === "sort"} onOpen={() => openSub("sort")} onLeave={leaveSub}>
            {orderItems(t).map((item) => (
              <button
                key={item.value}
                type="button"
                role="menuitemradio"
                aria-checked={prefs.ordering === item.value}
                onClick={() => onPrefs({ ...prefs, ordering: item.value })}
              >
                <span className="mode-row">
                  <span>{item.label}</span>
                  <Check on={prefs.ordering === item.value} />
                </span>
              </button>
            ))}
          </FlyoutItem>
          <FlyoutItem label={t("sidebar.show")} open={sub === "show"} onOpen={() => openSub("show")} onLeave={leaveSub}>
            {showItems(t).map((item) => (
              <button
                key={item.key}
                type="button"
                role="menuitemcheckbox"
                aria-checked={prefs[item.key]}
                onClick={() => onPrefs(toggleShow(prefs, item.key))}
              >
                <span className="mode-row">
                  <span>{item.label}</span>
                  <Check on={prefs[item.key]} />
                </span>
              </button>
            ))}
          </FlyoutItem>
          <FlyoutItem label={t("sidebar.filter")} open={sub === "filter"} onOpen={() => openSub("filter")} onLeave={leaveSub}>
            {filterItems(t).map((item) => (
              <button
                key={item.value}
                type="button"
                role="menuitemcheckbox"
                aria-checked={prefs.statusFilter.includes(item.value)}
                onClick={() => onPrefs(toggleStatusFilter(prefs, item.value))}
              >
                <span className="mode-row">
                  <span>{item.label}</span>
                  <Check on={prefs.statusFilter.includes(item.value)} />
                </span>
              </button>
            ))}
            <button
              type="button"
              role="menuitemcheckbox"
              aria-checked={prefs.includeArchived}
              onClick={() => onPrefs({ ...prefs, includeArchived: !prefs.includeArchived })}
            >
              <span className="mode-row">
                <span>归档</span>
                <Check on={prefs.includeArchived} />
              </span>
            </button>
            <div className="sep" />
            <button
              type="button"
              role="menuitem"
              onClick={() => onPrefs({ ...prefs, statusFilter: [], includeArchived: false })}
            >
              {t("sidebar.reset")}
            </button>
          </FlyoutItem>
          <div className="sep" />
          <button type="button" role="menuitem" onClick={() => runAction(onCollapseAll)}>
            {t("sidebar.collapseAll")}
          </button>
          <button type="button" role="menuitem" onClick={() => runAction(onMarkAllRead)}>
            {t("sidebar.markAllRead")}
          </button>
        </div>
      ) : null}
    </div>
  );
}
