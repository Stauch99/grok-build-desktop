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
  receivedAt?: number;
  onPick: (id: string) => void;
  onAlwaysAllow?: () => void;
  onCustomAnswer?: (text: string) => void;
};

export function PendingRequestCard({
  kind,
  title,
  options,
  timedOut,
  timeoutNotice,
  receivedAt,
  onPick,
  onAlwaysAllow,
  onCustomAnswer,
}: PendingRequestCardProps) {
  if (kind === "question") {
    return (
      <QuestionCard
        title={title}
        options={options.map((option) => ({ id: option.optionId, label: option.name }))}
        onPick={onPick}
        onCustomAnswer={onCustomAnswer}
      />
    );
  }
  if (!onAlwaysAllow) return null;
  return <PermissionCard title={title} options={options} timedOut={timedOut} timeoutNotice={timeoutNotice} receivedAt={receivedAt} onPick={onPick} onAlwaysAllow={onAlwaysAllow} />;
}
