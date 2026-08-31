import { useEffect, useRef, useState } from "react";

/** Matches `--dur` in styles.css. Layout motion only; never used while dragging. */
export const MOTION_MS = 200;

export function prefersReducedMotion(): boolean {
  return typeof window !== "undefined"
    && typeof window.matchMedia === "function"
    && window.matchMedia("(prefers-reduced-motion: reduce)").matches;
}

export function motionMs(): number {
  return prefersReducedMotion() ? 0 : MOTION_MS;
}

/**
 * Keep a node mounted through its exit animation, then drop it.
 * `leaving` is true only on the close frame so CSS can play rail-out.
 */
export function usePresence(open: boolean): { shown: boolean; leaving: boolean } {
  const [shown, setShown] = useState(open);
  const [leaving, setLeaving] = useState(false);

  useEffect(() => {
    if (open) {
      setShown(true);
      setLeaving(false);
      return;
    }
    if (!shown) {
      setLeaving(false);
      return;
    }
    const ms = motionMs();
    if (ms === 0) {
      setShown(false);
      setLeaving(false);
      return;
    }
    setLeaving(true);
    const id = window.setTimeout(() => {
      setShown(false);
      setLeaving(false);
    }, ms);
    return () => window.clearTimeout(id);
  }, [open, shown]);

  return { shown, leaving: !open && leaving };
}

/** True for one motion window after `signal` changes, skipping the first paint. */
export function useBriefMotion(signal: unknown): boolean {
  const [on, setOn] = useState(false);
  const skip = useRef(true);

  useEffect(() => {
    if (skip.current) {
      skip.current = false;
      return;
    }
    const ms = motionMs();
    if (ms === 0) return;
    setOn(true);
    const id = window.setTimeout(() => setOn(false), ms);
    return () => window.clearTimeout(id);
  }, [signal]);

  return on;
}
