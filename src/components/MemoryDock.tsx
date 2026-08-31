import { useEffect, useRef } from "react";
import { formatMemoryLabel, selectRecent, type MemoryChange } from "../lib/memory-dock";
import { DockCapsule } from "./ComposerDock";

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
    <DockCapsule
      kicker={title}
      onDismiss={onDismiss}
      dismissLabel="关闭"
      className="memory-dock"
      actions={
        <button type="button" className="dock-capsule-action" onClick={() => onOpen(first.path)}>
          打开
        </button>
      }
    >
      {formatMemoryLabel(first.path)}
    </DockCapsule>
  );
}
