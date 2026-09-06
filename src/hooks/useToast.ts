import { useCallback, useEffect, useRef, useState } from "react";
import {
  toastDurationMs,
  clearTimeoutRef,
  remainingTimeoutMs,
  scheduleTimeout,
} from "../lib/timeout-ref";

export type ToastAction = {
  actionLabel: string;
  onAction: () => void;
};

export type ToastState = {
  message: string;
  actionLabel?: string;
  onAction?: () => void;
};

export function useToast() {
  const [toast, setToast] = useState<ToastState | null>(null);
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const startedAt = useRef(0);
  const remainingMs = useRef(0);
  const paused = useRef(false);

  const showToast = useCallback((msg: string, action?: ToastAction) => {
    const onAction = action
      ? () => {
          clearTimeoutRef(timer);
          paused.current = false;
          setToast(null);
          action.onAction();
        }
      : undefined;
    setToast({ message: msg, actionLabel: action?.actionLabel, onAction });
    remainingMs.current = toastDurationMs(!!action);
    startedAt.current = Date.now();
    paused.current = false;
    scheduleTimeout(timer, () => setToast(null), remainingMs.current);
  }, []);

  const pauseToast = useCallback(() => {
    if (paused.current) return;
    remainingMs.current = remainingTimeoutMs(startedAt.current, remainingMs.current, Date.now());
    clearTimeoutRef(timer);
    paused.current = true;
  }, []);

  const resumeToast = useCallback(() => {
    if (!paused.current) return;
    paused.current = false;
    startedAt.current = Date.now();
    scheduleTimeout(timer, () => setToast(null), remainingMs.current);
  }, []);

  useEffect(() => () => clearTimeoutRef(timer), []);
  return { toast, showToast, pauseToast, resumeToast };
}
