import type { DoctorInfo } from "../api";

export type EmptyStateProps = {
  info: DoctorInfo | null;
  cwd: string;
  projectCount: number;
  onPickProject: () => void;
  onInbox?: () => void;
  onCopyLogin?: () => void;
  onBrowseWorkspace?: () => void;
};

type Step =
  | { kind: "text"; text: string }
  | { kind: "primary"; label: string; onClick: () => void }
  | { kind: "ghost"; label: string; onClick: () => void };

/**
 * Doctor-style onboarding when the thread has no messages yet.
 * Surfaces the first real blocker (CLI, auth, project) before generic guidance.
 */
export function EmptyState({ info, cwd, projectCount, onPickProject, onInbox, onCopyLogin, onBrowseWorkspace }: EmptyStateProps) {
  let title = "选择或新建对话";
  const steps: Step[] = [];

  if (info && !info.grokPath) {
    title = "找不到 grok CLI";
    steps.push({ kind: "text", text: "请先安装 Grok Build CLI（~/.grok/bin/grok）。" });
  } else if (info && !info.authPresent) {
    title = "尚未登录";
    steps.push({ kind: "text", text: "在终端运行 grok login 后再打开。" });
    if (onCopyLogin) steps.push({ kind: "ghost", label: "复制 grok login", onClick: onCopyLogin });
  } else if (!cwd && projectCount === 0) {
    title = "还没有项目";
    steps.push({ kind: "primary", label: "选择项目文件夹", onClick: onPickProject });
    if (onBrowseWorkspace) steps.push({ kind: "ghost", label: "浏览目录", onClick: onBrowseWorkspace });
    if (onInbox) {
      steps.push({ kind: "ghost", label: "先在收件箱里试试", onClick: onInbox });
    }
  } else {
    return null;
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
