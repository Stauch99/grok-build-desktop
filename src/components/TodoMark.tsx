import { IconTodoBusy, IconTodoOff, IconTodoOn } from "../grok-icons";

export function TodoMark({ status }: { status?: string }) {
  const label = status === "completed" ? "已完成" : status === "in_progress" ? "进行中" : "未完成";
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
