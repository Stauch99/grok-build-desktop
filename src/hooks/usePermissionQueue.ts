import { useCallback, useEffect, useRef, useState } from "react";
import { notify, onAcpRequest, sendRaw } from "../api";
import { findAlwaysOption, parseToolName, pickAllowOption, shouldSkipPermission } from "../lib/permission-allow";
import {
  enqueuePermission,
  markPermissionTimedOut,
  permissionFromAcpRequest,
  removePermission,
  selectShortcutPermission,
  type PermissionContext,
  type QueuedPermission,
} from "../lib/permission-queue";
import type { PermissionPane } from "../lib/permission-view";
import { notifyText, shouldNotify } from "../lib/notify";
import { isEditableShortcutTarget } from "../lib/shortcut-target";

export const PERMISSION_TIMEOUT_MS = 90_000;

export type PermissionQueue = {
  permissions: QueuedPermission[];
  answerPermission: (request: QueuedPermission, optionId: string) => Promise<void>;
  cancelPermission: (request: QueuedPermission) => Promise<void>;
};

export function usePermissionQueue(opts: {
  allowedTools: Set<string>;
  sessionId: string | null;
  runningSessionId: string | null;
  splitId: string | null;
  busy: boolean;
  splitBusy: boolean;
  focusedPaneRef: React.MutableRefObject<PermissionPane | null>;
  focusedRef: React.MutableRefObject<boolean>;
  currentTitleRef: React.MutableRefObject<string>;
  onTimeoutNotice?: () => void;
}): PermissionQueue {
  const [permissions, setPermissions] = useState<QueuedPermission[]>([]);
  const onTimeoutRef = useRef(opts.onTimeoutNotice);
  onTimeoutRef.current = opts.onTimeoutNotice;

  const answerPermission = useCallback(async (request: QueuedPermission, optionId: string) => {
    try {
      await sendRaw({ jsonrpc: "2.0", id: request.rpcId, result: { outcome: { outcome: "selected", optionId } } });
    } finally {
      setPermissions((q) => removePermission(q, request));
    }
  }, []);

  const cancelPermission = useCallback(async (request: QueuedPermission) => {
    await sendRaw({ jsonrpc: "2.0", id: request.rpcId, result: { outcome: { outcome: "cancelled" } } });
    setPermissions((q) => removePermission(q, request));
  }, []);

  useEffect(() => {
    let cancelled = false;
    let off: (() => void) | undefined;
    void onAcpRequest((msg) => {
      const parsed = permissionFromAcpRequest(msg);
      if (!parsed) return;
      setPermissions((queue) => enqueuePermission(queue, parsed));
    }).then((fn) => {
      if (cancelled) {
        fn();
        return;
      }
      off = fn;
    });
    return () => {
      cancelled = true;
      off?.();
    };
  }, []);

  useEffect(() => {
    const timers = permissions.filter((r) => !r.timedOut).map((r) =>
      window.setTimeout(() => {
        setPermissions((q) => markPermissionTimedOut(q, r));
        void answerPermission(r, "");
        onTimeoutRef.current?.();
      }, Math.max(0, PERMISSION_TIMEOUT_MS - (Date.now() - r.receivedAt))),
    );
    return () => timers.forEach(window.clearTimeout);
  }, [permissions, answerPermission]);

  useEffect(() => {
    for (const request of permissions) {
      const sid = request.sessionId || opts.sessionId;
      const tool = parseToolName(request.title, request.toolKind);
      if (!shouldSkipPermission(opts.allowedTools, sid, tool)) continue;
      const pick = findAlwaysOption(request.options) ?? pickAllowOption(request.options);
      if (pick) void answerPermission(request, pick);
    }
  }, [permissions, opts.allowedTools, opts.sessionId, answerPermission]);

  useEffect(() => {
    const request = permissions[permissions.length - 1];
    if (!request || !shouldNotify({ reason: "permission", focused: opts.focusedRef.current })) return;
    const { title, body } = notifyText("permission", opts.currentTitleRef.current, request.title);
    void notify(title, body);
  }, [permissions.length, opts.focusedRef, opts.currentTitleRef]);

  const context: PermissionContext = {
    mainSessionId: opts.sessionId,
    runningMainSessionId: opts.runningSessionId,
    splitSessionId: opts.splitId,
    mainBusy: opts.busy,
    splitBusy: opts.splitBusy,
  };

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (isEditableShortcutTarget(e.target as Element | null)) return;
      const request = selectShortcutPermission(permissions, context, opts.focusedPaneRef.current);
      if (!request) return;
      const n = Number(e.key);
      if (n >= 1 && n <= request.options.length) {
        e.preventDefault();
        void answerPermission(request, request.options[n - 1].optionId);
      }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [permissions, opts.sessionId, opts.runningSessionId, opts.splitId, opts.busy, opts.splitBusy, opts.focusedPaneRef, answerPermission]);

  return { permissions, answerPermission, cancelPermission };
}
