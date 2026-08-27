export type RunCockpitProps = {
  stall?: string | null;
  onDoctor: () => void;
  onRetry?: () => void;
};

/**
 * Mid-turn stall actions. Compact stays on the CLI (`/compact` or auto-compact).
 */
export function RunCockpit({ stall, onDoctor, onRetry }: RunCockpitProps) {
  return (
    <section className="permission">
      <h4>可能卡住了</h4>
      <p className="permission-hint">{stall || "这一轮很久没有新输出。"}</p>
      <div className="set-actions">
        {onRetry ? (
          <button type="button" className="btn primary" onClick={onRetry}>
            重试
          </button>
        ) : null}
        <button type="button" className={onRetry ? "btn ghost" : "btn primary"} onClick={onDoctor}>
          打开 doctor
        </button>
      </div>
    </section>
  );
}
