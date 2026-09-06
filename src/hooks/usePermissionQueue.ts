import { useCallback, useEffect, useRef, useState } from "react";
import { notify, sendRaw } from "../api";
import { findAlwaysOption, parseToolName, pickAllowOption, shouldAutoApprovePermission, shouldSkipPermission } from "../lib/permission-allow";
import { permissionReplyAgent } from "../lib/permission-agent";
import {
  enqueuePermission,
  markPermissionTimedOut,
  PERMISSION_TIMEOUT_MS,
  permissionFromAcpRequest,
  removePermission,
  selectShortcutPermission,
  type AcpPermissionMessage,
  type PermissionContext,
  type QueuedPermission,
} from "../lib/permission-queue";
import { onTaggedAcpRequest } from "../lib/workbench-api";
import { requestPermissionKind, type PermissionPane } from "../lib/permission-view";
import { notifyText, shouldNotify } from "../lib/notify";
import { isEditableShortcutTarget } from "../lib/shortcut-target";
import { recordLocalEvent } from "../lib/telemetry";

export type PermissionQueue = {
  permissions: QueuedPermission[];
  answerPermission: (request: QueuedPermission, optionId: string) => Promise<void>;
  cancelPermission: (request: QueuedPermission) => Promise<void>;
};

export function usePermissionQueue(opts: {
  allowedTools: Set<string>;
  yolo?: boolean;
  sessionId: string | null;
  runningSessionId: string | null;
  splitId: string | null;
  busy: boolean;
  splitBusy: boolean;
  extraPanes?: { id: string; sessionId: string | null; busy: boolean }[];
  focusedPaneRef: React.MutableRefObject<PermissionPane | null>;
  focusedRef: React.MutableRefObject<boolean>;
  currentTitleRef: React.MutableRefObject<string>;
  telemetry?: boolean;
  onTimeoutNotice?: () => void;
}): PermissionQueue {
  const telemetry = opts.telemetry ?? false;
  const telemetryRef = useRef(telemetry);
  telemetryRef.current = telemetry;
  const [permissions, setPermissions] = useState<QueuedPermission[]>([]);
  const onTimeoutRef = useRef(opts.onTimeoutNotice);
  onTimeoutRef.current = opts.onTimeoutNotice;

  const yoloRef = useRef(opts.yolo === true);
  yoloRef.current = opts.yolo === true;

  const answerPermission = useCallback(async (request: QueuedPermission, optionId: string) => {
    try {
      await sendRaw({ jsonrpc: "2.0", id: request.rpcId, result: { outcome: { outcome: "selected", optionId } } }, permissionReplyAgent(request.agentId));
    } finally {
      recordLocalEvent(telemetry, "permission.answer");
      setPermissions((q) => removePermission(q, request));
    }
  }, [telemetry]);
  const answerRef = useRef(answerPermission);
  answerRef.current = answerPermission;

  const cancelPermission = useCallback(async (request: QueuedPermission) => {
    await sendRaw({ jsonrpc: "2.0", id: request.rpcId, result: { outcome: { outcome: "cancelled" } } }, permissionReplyAgent(request.agentId));
    setPermissions((q) => removePermission(q, request));
  }, []);

  useEffect(() => {
    let cancelled = false;
    let off: (() => void) | undefined;
    void onTaggedAcpRequest((agentId, msg) => {
      const parsed = permissionFromAcpRequest(msg as AcpPermissionMessage, agentId);
      if (!parsed) return;
      if (shouldAutoApprovePermission(yoloRef.current, requestPermissionKind(parsed))) {
        const pick = findAlwaysOption(parsed.options) ?? pickAllowOption(parsed.options);
        if (pick) {
          void answerRef.current(parsed, pick);
          return;
        }
      }
      setPermissions((q) => enqueuePermission(q, parsed));
      recordLocalEvent(telemetryRef.current, "permission.show");
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
        onTimeoutRef.current?.();
      }, Math.max(0, PERMISSION_TIMEOUT_MS - (Date.now() - r.receivedAt))),
    );
    return () => timers.forEach(window.clearTimeout);
  }, [permissions]);

  useEffect(() => {
    const yolo = opts.yolo === true;
    for (const request of permissions) {
      const kind = requestPermissionKind(request);
      const sid = request.sessionId || opts.sessionId;
      const tool = parseToolName(request.title, request.toolKind);
      const skip = shouldAutoApprovePermission(yolo, kind) || shouldSkipPermission(opts.allowedTools, sid, tool);
      if (!skip) continue;
      const pick = findAlwaysOption(request.options) ?? pickAllowOption(request.options);
      if (pick) void answerPermission(request, pick);
    }
  }, [permissions, opts.allowedTools, opts.sessionId, opts.yolo, answerPermission]);

  useEffect(() => {
    const request = permissions[permissions.length - 1];
    if (!request || shouldAutoApprovePermission(opts.yolo === true, requestPermissionKind(request))) return;
    if (!shouldNotify({ reason: "permission", focused: opts.focusedRef.current })) return;
    const { title, body } = notifyText("permission", opts.currentTitleRef.current, request.title);
    void notify(title, body);
  }, [permissions.length, opts.focusedRef, opts.currentTitleRef, opts.yolo]);

  const context: PermissionContext = {
    mainSessionId: opts.sessionId,
    runningMainSessionId: opts.runningSessionId,
    splitSessionId: opts.splitId,
    mainBusy: opts.busy,
    splitBusy: opts.splitBusy,
    extraPanes: opts.extraPanes,
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
