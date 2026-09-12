import { useT } from "../lib/locale-context";

export type DashboardSession = {
  id: string;
  title: string;
  status: "needs-input" | "running" | "idle";
};

export type DashboardPanelProps = {
  sessions: DashboardSession[];
  onOpen: (id: string) => void;
};

const GROUPS: Array<{ status: DashboardSession["status"]; key: string }> = [
  { status: "needs-input", key: "dashboard.needsYou" },
  { status: "running", key: "dashboard.running" },
  { status: "idle", key: "dashboard.idle" },
];

/**
 * /dashboard: sessions bucketed by Needs input / Running / Idle.
 */
export function DashboardPanel({ sessions, onOpen }: DashboardPanelProps) {
  const t = useT();
  const filled = GROUPS.map((group) => ({
    ...group,
    rows: sessions.filter((s) => s.status === group.status),
  })).filter((group) => group.rows.length > 0);

  if (filled.length === 0) {
    return <p className="float-empty">{t("dashboard.empty")}</p>;
  }

  return (
    <div>
      {filled.map((group) => (
        <section key={group.status}>
          <h3>{t(group.key)}</h3>
          <div className="file-list">
            {group.rows.map((s) => (
              <button
                key={s.id}
                type="button"
                className="file-item"
                onClick={() => onOpen(s.id)}
              >
                {s.title || t("dashboard.untitled")}
              </button>
            ))}
          </div>
        </section>
      ))}
    </div>
  );
}
