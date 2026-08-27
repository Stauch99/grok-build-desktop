import { describe, expect, it } from "vitest";
import { deriveRunStatus } from "./run-status";

describe("run status model", () => {
  it("uses deterministic priority for attention and lifecycle states", () => {
    expect(deriveRunStatus({ disconnected: true, running: true }).kind).toBe("disconnected");
    expect(deriveRunStatus({ trustRequired: true, running: true }).kind).toBe("trust-required");
    expect(deriveRunStatus({ pending: "permission", running: true }).kind).toBe("permission");
    expect(deriveRunStatus({ pending: "question", running: true }).kind).toBe("question");
    expect(deriveRunStatus({ running: true, stalled: true }).kind).toBe("stalled");
    expect(deriveRunStatus({ running: true, planComplete: true }).kind).toBe("running");
    expect(deriveRunStatus({}).kind).toBe("idle");
  });

  it("keeps status copy concise and supplies stalled detail", () => {
    expect(deriveRunStatus({ pending: "permission" }).label).toBe("需要许可");
    expect(deriveRunStatus({ running: true, stalled: true, stallDetail: "已 60 秒没有新输出" })).toEqual({ kind: "stalled", label: "运行可能停滞", detail: "已 60 秒没有新输出" });
  });
});
