import { formatMemoryLabel, selectRecent, type MemoryChange } from "../lib/memory-dock";

type Props = {
  changes: MemoryChange[];
  onOpen: (path: string) => void;
  onDismiss: () => void;
};

export function MemoryDock({ changes, onOpen, onDismiss }: Props) {
  const recent = selectRecent(changes, Date.now());
  if (recent.length === 0) return null;

  const first = recent[0]!;
  return (
    <div className="memory-dock">
      <span>项目记忆已更新</span>
      <span>{formatMemoryLabel(first.path)}</span>
      <button type="button" onClick={() => onOpen(first.path)}>
        打开
      </button>
      <button type="button" onClick={onDismiss}>
        关闭
      </button>
    </div>
  );
}
