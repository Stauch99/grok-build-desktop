import { describe, expect, it } from "vitest";
import { derivePermissionView, pendingRequestCardKind } from "./permission-view";

describe("permission view model", () => {
  it("recognizes questions and assigns an explicit split session to the split pane", () => {
    expect(derivePermissionView({ request: { title: "Choose an option", toolKind: "question", sessionId: "split-1" }, mainSessionId: "main-1", runningMainSessionId: "main-1", splitSessionId: "split-1", mainBusy: true, splitBusy: true }))
      .toEqual({ kind: "question", pane: "split", mainVisible: false, splitVisible: true, statusPending: null });
  });

  it("falls back to the only busy pane when the request has no session id", () => {
    expect(derivePermissionView({ request: { title: "Run shell command" }, mainSessionId: "main-1", runningMainSessionId: null, splitSessionId: "split-1", mainBusy: false, splitBusy: true }))
      .toEqual({ kind: "permission", pane: "split", mainVisible: false, splitVisible: true, statusPending: null });
  });

  it("provides RunStatusRegion input only for a visible main request", () => {
    expect(derivePermissionView({ request: { title: "需要选择", sessionId: "main-1" }, mainSessionId: "main-1", runningMainSessionId: "main-1", splitSessionId: "split-1", mainBusy: true, splitBusy: false }))
      .toEqual({ kind: "question", pane: "main", mainVisible: true, splitVisible: false, statusPending: "question" });
  });

  it("keeps main-pane status attention for a request owned by another main session", () => {
    expect(derivePermissionView({ request: { title: "Run shell", sessionId: "background" }, mainSessionId: "visible", runningMainSessionId: "background", splitSessionId: null, mainBusy: true, splitBusy: false }))
      .toEqual({ kind: "permission", pane: "main", mainVisible: false, splitVisible: false, statusPending: "permission" });
  });

  it("returns an empty view without a request", () => {
    expect(derivePermissionView({ request: null, mainSessionId: null, runningMainSessionId: null, splitSessionId: null, mainBusy: false, splitBusy: false }))
      .toEqual({ kind: null, pane: null, mainVisible: false, splitVisible: false, statusPending: null });
  });

  it("selects the split card from request kind without exposing the other pane", () => {
    const question = derivePermissionView({ request: { title: "Choose", toolKind: "question", sessionId: "split" }, mainSessionId: "main", runningMainSessionId: "main", splitSessionId: "split", mainBusy: true, splitBusy: true });
    expect(pendingRequestCardKind(question, "split")).toBe("question");
    expect(pendingRequestCardKind(question, "main")).toBeNull();
    const permission = derivePermissionView({ request: { title: "Run shell", sessionId: "split" }, mainSessionId: "main", runningMainSessionId: "main", splitSessionId: "split", mainBusy: true, splitBusy: true });
    expect(pendingRequestCardKind(permission, "split")).toBe("permission");
  });
});
