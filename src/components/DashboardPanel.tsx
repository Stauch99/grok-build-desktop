export type DashboardSession = {
  id: string;
  title: string;
  status: "needs-input" | "running" | "idle";
};

export type DashboardPanelProps = {
  sessions: DashboardSession[];
  onOpen: (id: string) => void;
};

const GROUPS: { status: DashboardSession["status"]; label: string }[] = [
  { status: "needs-input", label: "等你" },
  { status: "running", label: "进行中" },
  { status: "idle", label: "空闲" },
];

/**
 * /dashboard: sessions bucketed by Needs input / Running / Idle.
 */
export function DashboardPanel({ sessions, onOpen }: DashboardPanelProps) {
  const filled = GROUPS.map((group) => ({
    ...group,
    rows: sessions.filter((s) => s.status === group.status),
  })).filter((group) => group.rows.length > 0);

  if (filled.length === 0) {
    return <p className="float-empty">还没有会话。从左侧打开一次对话。</p>;
  }

  return (
    <div>
      {filled.map((group) => (
        <section key={group.status}>
          <h3>{group.label}</h3>
          <div className="file-list">
            {group.rows.map((s) => (
              <button
                key={s.id}
                type="button"
                className="file-item"
                onClick={() => onOpen(s.id)}
              >
                {s.title || "未命名会话"}
              </button>
            ))}
          </div>
        </section>
      ))}
    </div>
  );
}
