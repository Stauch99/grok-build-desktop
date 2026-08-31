import { useEffect, useState } from "react";
import { formatElapsed } from "../lib/chat";
import { DockCapsule } from "./ComposerDock";

export type GoalBarProps = {
  goal: string;
  startedAt: number;
  live?: boolean;
};

/** Current ACP plan item as a capsule above the composer. */
export function GoalBar({ goal, startedAt, live = false }: GoalBarProps) {
  const [now, setNow] = useState(() => Date.now());

  useEffect(() => {
    const id = window.setInterval(() => setNow(Date.now()), 1000);
    return () => window.clearInterval(id);
  }, [startedAt]);

  return (
    <DockCapsule
      kicker="目标"
      meta={formatElapsed(now - startedAt)}
      tone={live ? "live" : "neutral"}
      className="goal-bar"
      label="当前目标"
    >
      <span title={goal}>{goal}</span>
    </DockCapsule>
  );
}
