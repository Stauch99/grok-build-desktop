import { PermissionCard } from "./PermissionCard";
import { QuestionCard } from "./QuestionCard";
import type { PermissionKind } from "../lib/permission-view";
import type { PermissionOption } from "../lib/permission-allow";

type PendingRequestCardProps = {
  kind: PermissionKind;
  title: string;
  options: PermissionOption[];
  timedOut?: boolean;
  timeoutNotice?: string;
  onPick: (id: string) => void;
  onAlwaysAllow?: () => void;
};

export function PendingRequestCard({ kind, title, options, timedOut, timeoutNotice, onPick, onAlwaysAllow }: PendingRequestCardProps) {
  if (kind === "question") {
    return <QuestionCard title={title} options={options.map((option) => ({ id: option.optionId, label: option.name }))} onPick={onPick} />;
  }
  if (!onAlwaysAllow) return null;
  return <PermissionCard title={title} options={options} timedOut={timedOut} timeoutNotice={timeoutNotice} onPick={onPick} onAlwaysAllow={onAlwaysAllow} />;
}
