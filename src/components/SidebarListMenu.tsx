import { useEffect, useRef, useState, type ReactNode } from "react";
import { IconCheck, IconChevron, IconFilter } from "../icons";
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

const GROUP_ITEMS: { value: SidebarGrouping; label: string }[] = [
  { value: "project", label: "项目" },
  { value: "updated", label: "更新时间" },
  { value: "status", label: "状态" },
];

const ORDER_ITEMS: { value: SidebarOrdering; label: string }[] = [
  { value: "updated", label: "最近更新" },
  { value: "title", label: "标题" },
];

const SHOW_ITEMS: { key: "showTokens" | "showStatus" | "showWorktree"; label: string }[] = [
  { key: "showTokens", label: "Token" },
  { key: "showStatus", label: "状态" },
  { key: "showWorktree", label: "工作树" },
];

const FILTER_ITEMS: { value: StatusFilter; label: string }[] = [
  { value: "needs-you", label: "需要你" },
  { value: "unread", label: "未读" },
  { value: "working", label: "运行中" },
  { value: "done", label: "已读" },
];

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
        aria-label="工作区筛选"
        title="工作区筛选"
        aria-haspopup="menu"
        aria-expanded={open}
        onClick={toggleOpen}
      >
        <IconFilter size={14} />
      </button>
      {open && pos ? (
        <div className="menu list-menu" role="menu" style={{ top: pos.top, left: pos.left }}>
          <FlyoutItem label="分组" open={sub === "group"} onOpen={() => openSub("group")} onLeave={leaveSub}>
            {GROUP_ITEMS.map((item) => (
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
          <FlyoutItem label="排序" open={sub === "sort"} onOpen={() => openSub("sort")} onLeave={leaveSub}>
            {ORDER_ITEMS.map((item) => (
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
          <FlyoutItem label="显示" open={sub === "show"} onOpen={() => openSub("show")} onLeave={leaveSub}>
            {SHOW_ITEMS.map((item) => (
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
          <FlyoutItem label="筛选" open={sub === "filter"} onOpen={() => openSub("filter")} onLeave={leaveSub}>
            {FILTER_ITEMS.map((item) => (
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
              重置
            </button>
          </FlyoutItem>
          <div className="sep" />
          <button type="button" role="menuitem" onClick={() => runAction(onCollapseAll)}>
            全部折叠
          </button>
          <button type="button" role="menuitem" onClick={() => runAction(onMarkAllRead)}>
            全部标为已读
          </button>
        </div>
      ) : null}
    </div>
  );
}
