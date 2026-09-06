import { useEffect, useRef, useState, type CSSProperties } from "react";
import {
  formatMemoryLabel,
  MEMORY_DOCK_FADE_MS,
  MEMORY_DOCK_HOLD_MS,
  selectRecent,
  type MemoryChange,
} from "../lib/memory-dock";
import { prefersReducedMotion } from "../lib/motion";
import { useT } from "../lib/locale-context";
import { DockCapsule } from "./ComposerDock";

type Props = {
  changes: MemoryChange[];
  title?: string;
  onOpen: (path: string) => void;
  onDismiss: () => void;
};

export function MemoryDock({ changes, title, onOpen, onDismiss }: Props) {
  const t = useT();
  const heading = title ?? t("memory.dockUpdated");
  const recent = selectRecent(changes, Date.now());
  const first = recent[0];
  const dismissRef = useRef(onDismiss);
  dismissRef.current = onDismiss;
  const remainingRef = useRef(MEMORY_DOCK_HOLD_MS + MEMORY_DOCK_FADE_MS);
  const startedRef = useRef(0);
  const [paused, setPaused] = useState(false);

  useEffect(() => {
    if (!first) return;
    remainingRef.current = prefersReducedMotion()
      ? MEMORY_DOCK_HOLD_MS
      : MEMORY_DOCK_HOLD_MS + MEMORY_DOCK_FADE_MS;
    startedRef.current = Date.now();
  }, [first?.path, first?.mtime]);

  useEffect(() => {
    if (!first || paused) return;
    const id = window.setTimeout(() => dismissRef.current(), remainingRef.current);
    startedRef.current = Date.now();
    return () => window.clearTimeout(id);
  }, [first?.path, first?.mtime, paused]);

  if (!first) return null;

  const style = {
    ["--memory-dock-hold"]: `${MEMORY_DOCK_HOLD_MS}ms`,
    ["--memory-dock-fade"]: `${MEMORY_DOCK_FADE_MS}ms`,
  } as CSSProperties;

  return (
    <div
      className="memory-dock"
      style={style}
      onMouseEnter={() => {
        remainingRef.current = Math.max(0, remainingRef.current - (Date.now() - startedRef.current));
        setPaused(true);
      }}
      onMouseLeave={() => setPaused(false)}
      onFocus={() => setPaused(true)}
      onBlur={() => setPaused(false)}
    >
      <DockCapsule
        kicker={heading}
        onDismiss={onDismiss}
        dismissLabel={t("memory.dismissChip")}
        actions={
          <button type="button" className="dock-capsule-action" onClick={() => onOpen(first.path)}>
            {t("memory.open")}
          </button>
        }
      >
        {formatMemoryLabel(first.path)}
      </DockCapsule>
    </div>
  );
}
