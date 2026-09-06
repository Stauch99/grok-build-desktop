import type { AgentDoctor } from "../lib/agent-doctor";
import { doctorActionHint, emptyDoctorKind } from "../lib/agent-doctor";
import { useT } from "../lib/locale-context";

export type EmptyStateProps = {
  doctor: Pick<AgentDoctor, "binary" | "authPresent" | "loginHint" | "agentId"> | null;
  agentLabel: string;
  cwd: string;
  projectCount: number;
  onPickProject: () => void;
  onInbox?: () => void;
  onCopyLogin?: (text: string) => void;
  onBrowseWorkspace?: () => void;
};

type Step =
  | { kind: "text"; text: string }
  | { kind: "primary"; label: string; onClick: () => void }
  | { kind: "ghost"; label: string; onClick: () => void };

/**
 * Doctor-style onboarding when the thread has no messages yet.
 * Surfaces the first real blocker (CLI, auth, project) for the selected agent.
 */
export function EmptyState({
  doctor,
  agentLabel,
  cwd,
  projectCount,
  onPickProject,
  onInbox,
  onCopyLogin,
  onBrowseWorkspace,
}: EmptyStateProps) {
  const t = useT();
  const kind = emptyDoctorKind({ doctor, cwd, projectCount });
  if (kind === "hidden") return null;

  let title = t("empty.pickThread");
  const steps: Step[] = [];
  const hint = doctor ? doctorActionHint(doctor)[0] : undefined;

  if (kind === "cli") {
    title = t("empty.cliMissing", { agent: agentLabel });
    steps.push({ kind: "text", text: t("empty.cliHint", { agent: agentLabel, hint: hint ?? "" }) });
    if (onCopyLogin && hint) steps.push({ kind: "ghost", label: t("empty.copyLogin"), onClick: () => onCopyLogin(hint) });
  } else if (kind === "auth") {
    title = t("empty.authMissing", { agent: agentLabel });
    steps.push({ kind: "text", text: t("empty.authHint", { cmd: hint ?? "" }) });
    if (onCopyLogin && hint) steps.push({ kind: "ghost", label: t("empty.copyLogin"), onClick: () => onCopyLogin(hint) });
  } else {
    title = t("empty.noProject");
    steps.push({ kind: "primary", label: t("empty.pickProject"), onClick: onPickProject });
    if (onBrowseWorkspace) steps.push({ kind: "ghost", label: t("empty.browse"), onClick: onBrowseWorkspace });
    if (onInbox) steps.push({ kind: "ghost", label: t("empty.tryInbox"), onClick: onInbox });
  }

  const textSteps = steps.filter((s): s is Extract<Step, { kind: "text" }> => s.kind === "text");
  const actionSteps = steps.filter(
    (s): s is Extract<Step, { kind: "primary" | "ghost" }> => s.kind !== "text",
  );

  return (
    <div className="empty empty-doctor">
      <p>{title}</p>
      {textSteps.length > 0 &&
        textSteps.slice(0, 3).map((step, i) => (
          <p key={i}>{step.text}</p>
        ))}
      {actionSteps.length > 0 && (
        <div className="set-actions">
          {actionSteps.slice(0, 3).map((step) => (
            <button
              key={step.label}
              type="button"
              className={`btn ${step.kind === "primary" ? "primary" : "ghost"}`}
              onClick={step.onClick}
            >
              {step.label}
            </button>
          ))}
        </div>
      )}
    </div>
  );
}
