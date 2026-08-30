import { beforeEach, describe, expect, it, vi } from "vitest";

const invoke = vi.fn();
const listen = vi.fn();
vi.mock("@tauri-apps/api/core", () => ({ invoke: (...a: unknown[]) => invoke(...a) }));
vi.mock("@tauri-apps/api/event", () => ({ listen: (...a: unknown[]) => listen(...a) }));

describe("workbench-api", () => {
  beforeEach(() => {
    invoke.mockReset();
    listen.mockReset();
  });

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

  it("calls import_agents_mcp_first_open", async () => {
    const { importAgentsMcpFirstOpen } = await import("./workbench-api");
    invoke.mockResolvedValueOnce(["git"]);
    await expect(importAgentsMcpFirstOpen()).resolves.toEqual(["git"]);
    expect(invoke).toHaveBeenCalledWith("import_agents_mcp_first_open");
  });

  it("onTaggedAcpRequest listens and forwards tagged payload", async () => {
    const unlisten = vi.fn();
    listen.mockResolvedValueOnce(unlisten);
    const { onTaggedAcpRequest } = await import("./workbench-api");
    const handler = vi.fn();
    const payload = { method: "session/request_permission", params: {} };
    await onTaggedAcpRequest(handler);
    expect(listen).toHaveBeenCalledWith("acp-request", expect.any(Function));
    const onEvent = listen.mock.calls[0]![1] as (e: { payload: unknown }) => void;
    onEvent({ payload: { agentId: "claude", generation: 1, payload } });
    expect(handler).toHaveBeenCalledWith("claude", payload);
  });
});
