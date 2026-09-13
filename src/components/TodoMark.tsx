import { IconTodoBusy, IconTodoOff, IconTodoOn } from "../grok-icons";
import { useT } from "../lib/locale-context";

export function TodoMark({ status }: { status?: string }) {
  const t = useT();
  const label =
    status === "completed"
      ? t("todo.completed")
      : status === "in_progress"
        ? t("todo.progress")
        : t("todo.pending");
  const icon =
    status === "completed" ? (
      <IconTodoOn size={16} />
    ) : status === "in_progress" ? (
      <IconTodoBusy size={16} />
    ) : (
      <IconTodoOff size={16} />
    );
  return (
    <span className="box" aria-label={label}>
      {icon}
    </span>
  );
}
