import { useT } from "../lib/locale-context";

export type SandboxBarProps = {
  mode?: string;
  note?: string;
};

/**
 * Honest sandbox status. Runtime is the CLI — desktop only reports.
 */
export function SandboxBar({ mode, note }: SandboxBarProps) {
  const t = useT();
  const label = note || (mode === "yolo" ? t("perm.yoloHint") : t("sandbox.cli"));

  return (
    <p className="sandbox-bar" role="status" aria-label={t("sandbox.status")}>
      {t("sandbox.prefix")} · {label}
    </p>
  );
}
