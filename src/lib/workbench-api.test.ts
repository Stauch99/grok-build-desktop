import { beforeEach, describe, expect, it, vi } from "vitest";

const invoke = vi.fn();
vi.mock("@tauri-apps/api/core", () => ({ invoke: (...a: unknown[]) => invoke(...a) }));

describe("workbench-api", () => {
  beforeEach(() => invoke.mockReset());

  it("calls doctor_all and install_marketplace_skill", async () => {
    const { doctorAll, installMarketplaceSkill } = await import("./workbench-api");
    invoke.mockResolvedValueOnce([{ agentId: "grok", authKind: "none" }]);
    await expect(doctorAll()).resolves.toEqual([{ agentId: "grok", authKind: "none" }]);
    expect(invoke).toHaveBeenCalledWith("doctor_all");
    invoke.mockResolvedValueOnce("/tmp/.agents/skills/pdf");
    await expect(installMarketplaceSkill("/tmp/pdf")).resolves.toBe("/tmp/.agents/skills/pdf");
    expect(invoke).toHaveBeenCalledWith("install_marketplace_skill", { source: "/tmp/pdf" });
  });

  it("calls sync_agent_skill with name and enabled entries", async () => {
    const { syncAgentSkill } = await import("./workbench-api");
    invoke.mockResolvedValueOnce([["grok", "linked"]]);
    await expect(syncAgentSkill("pdf", { grok: true, kimi: false })).resolves.toEqual([
      ["grok", "linked"],
    ]);
    expect(invoke).toHaveBeenCalledWith("sync_agent_skill", {
      name: "pdf",
      enabled: [
        ["grok", true],
        ["kimi", false],
      ],
    });
  });
});
