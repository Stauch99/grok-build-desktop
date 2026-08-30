import { useEffect, useRef } from "react";
import { formatMemoryLabel, selectRecent, type MemoryChange } from "../lib/memory-dock";

type Props = {
  changes: MemoryChange[];
  title?: string;
  onOpen: (path: string) => void;
  onDismiss: () => void;
};

const HOLD_MS = 3000;
const FADE_MS = 400;

export function MemoryDock({ changes, title = "项目记忆已更新", onOpen, onDismiss }: Props) {
  const recent = selectRecent(changes, Date.now());
  const first = recent[0];
  const dismissRef = useRef(onDismiss);
  dismissRef.current = onDismiss;

  useEffect(() => {
    if (!first) return;
    const id = window.setTimeout(() => dismissRef.current(), HOLD_MS + FADE_MS);
    return () => window.clearTimeout(id);
  }, [first?.path, first?.mtime]);

  if (!first) return null;

  return (
    <div className="memory-dock">
      <span>{title}</span>
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
