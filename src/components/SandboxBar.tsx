export type SandboxBarProps = {
  mode?: string;
  note?: string;
};

/**
 * Honest sandbox status. Runtime is the CLI — desktop only reports.
 */
export function SandboxBar({ mode, note }: SandboxBarProps) {
  const label =
    note ||
    (mode === "yolo"
      ? "始终批准：危险命令仍可能被 hooks / 沙箱拦住。"
      : "沙箱由 grok CLI 执行，桌面不另开隔离层。");

  return (
    <p className="sandbox-bar" role="status" aria-label="沙箱状态">
      沙箱 · {label}
    </p>
  );
}
