import { useCallback, useEffect, useRef, useState } from "react";
import { TOAST_CLEAR_MS, clearTimeoutRef, scheduleTimeout } from "../lib/timeout-ref";

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
  const showToast = useCallback((msg: string, action?: ToastAction) => {
    const onAction = action
      ? () => {
          clearTimeoutRef(timer);
          setToast(null);
          action.onAction();
        }
      : undefined;
    setToast({ message: msg, actionLabel: action?.actionLabel, onAction });
    scheduleTimeout(timer, () => setToast(null), TOAST_CLEAR_MS);
  }, []);
  useEffect(() => () => clearTimeoutRef(timer), []);
  return { toast, showToast };
}
