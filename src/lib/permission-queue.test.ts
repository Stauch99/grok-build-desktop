import { describe, expect, it } from "vitest";
import {
  enqueuePermission,
  isRememberedTool,
  markPermissionTimedOut,
  permissionFromAcpRequest,
  rejectCountdownLabel,
  rememberTool,
  removePermission,
  secondsUntilReject,
  selectPanePermissions,
  selectShortcutPermission,
  type QueuedPermission,
} from "./permission-queue";
const request = (rpcId: string, sessionId: string): QueuedPermission => ({ rpcId, sessionId, title: rpcId, options: [{ optionId: "allow", name: "Allow" }], receivedAt: 1, timedOut: false });
describe("permission queue", () => {
  it("keeps ordered concurrent requests and removes only the selected RPC", () => {
    const queued = enqueuePermission(enqueuePermission([], request("main-rpc", "main")), request("split-rpc", "split"));
    expect(queued.map((item) => item.rpcId)).toEqual(["main-rpc", "split-rpc"]);
    expect(removePermission(queued, request("main-rpc", "main")).map((item) => item.rpcId)).toEqual(["split-rpc"]);
  });
  it("presents one independently owned request in each pane", () => {
    const selected = selectPanePermissions([request("m1", "main"), request("m2", "main"), request("s1", "split")], { mainSessionId: "main", runningMainSessionId: "main", splitSessionId: "split", mainBusy: true, splitBusy: true });
    expect(selected.main?.rpcId).toBe("m1"); expect(selected.split?.rpcId).toBe("s1");
  });
  it("targets the focused visible pane, defaulting to main when ambiguous", () => {
    const queue = [request("main-rpc", "main"), request("split-rpc", "split")];
    const context = { mainSessionId: "main", runningMainSessionId: "main", splitSessionId: "split", mainBusy: true, splitBusy: true };
    expect(selectShortcutPermission(queue, context, "split")?.rpcId).toBe("split-rpc"); expect(selectShortcutPermission(queue, context, null)?.rpcId).toBe("main-rpc");
  });
  it("parses an ACP permission request", () => {
    const parsed = permissionFromAcpRequest({
      method: "session/request_permission",
      id: 7,
      params: {
        sessionId: "sid",
        toolCall: { title: "Edit file", kind: "edit" },
        options: [{ optionId: "allow", name: "Allow", kind: "allow_once" }, { optionId: 1, name: "bad" }],
      },
    }, 42);
    expect(parsed).toEqual({
      rpcId: 7,
      title: "Edit file",
      toolKind: "edit",
      options: [{ optionId: "allow", name: "Allow", kind: "allow_once" }],
      sessionId: "sid",
      receivedAt: 42,
      timedOut: false,
    });
  });

  it("ignores non-permission RPC", () => {
    expect(permissionFromAcpRequest({ method: "session/update", id: 1 })).toBeNull();
    expect(permissionFromAcpRequest({ method: "session/request_permission" })).toBeNull();
  });

  it("marks only the timed-out request", () => {
    const queue = [request("m", "main"), request("s", "split")];
    expect(markPermissionTimedOut(queue, request("s", "split")).map((item) => [item.rpcId, item.timedOut])).toEqual([["m", false], ["s", true]]);
  });
});

describe("session remember allow-list", () => {
  it("stores a Set of tool names per session id", () => {
    const next = rememberTool(new Map(), "s1", "bash");
    expect([...next.get("s1") ?? []]).toEqual(["bash"]);
    expect(isRememberedTool(next, "s1", "bash")).toBe(true);
    expect(isRememberedTool(next, "s1", "read")).toBe(false);
    expect(isRememberedTool(next, "s2", "bash")).toBe(false);
  });

  it("does not mutate the previous map", () => {
    const base = rememberTool(new Map(), "s1", "read");
    const next = rememberTool(base, "s1", "write");
    expect(base.get("s1")?.has("write")).toBe(false);
    expect(isRememberedTool(next, "s1", "read")).toBe(true);
    expect(isRememberedTool(next, "s1", "write")).toBe(true);
  });
});

describe("permission timeout countdown", () => {
  it("counts 90s down to zero", () => {
    const start = 1_000_000;
    expect(secondsUntilReject(start, start)).toBe(90);
    expect(secondsUntilReject(start, start + 30_000)).toBe(60);
    expect(secondsUntilReject(start, start + 89_001)).toBe(1);
    expect(secondsUntilReject(start, start + 90_000)).toBe(0);
    expect(secondsUntilReject(start, start + 120_000)).toBe(0);
  });

  it("labels the remaining reject window", () => {
    expect(rejectCountdownLabel(12, "zh")).toBe("将在 12s 后拒绝");
    expect(rejectCountdownLabel(12, "en")).toContain("12");
    expect(rejectCountdownLabel(12, "en")).not.toBe(rejectCountdownLabel(12, "zh"));
  });
});
