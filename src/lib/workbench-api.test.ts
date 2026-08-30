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

  it("calls read_agents_file with kind", async () => {
    const { readAgentsFile } = await import("./workbench-api");
    invoke.mockResolvedValueOnce("# AGENTS");
    await expect(readAgentsFile("agents")).resolves.toBe("# AGENTS");
    expect(invoke).toHaveBeenCalledWith("read_agents_file", { kind: "agents" });
  });

  it("calls write_agents_file with kind and text", async () => {
    const { writeAgentsFile } = await import("./workbench-api");
    invoke.mockResolvedValueOnce(undefined);
    await expect(writeAgentsFile("rules", "# Rules\n")).resolves.toBeUndefined();
    expect(invoke).toHaveBeenCalledWith("write_agents_file", { kind: "rules", text: "# Rules\n" });
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

  it("calls upsert_toml_mcp and remove_toml_mcp", async () => {
    const { upsertTomlMcp, removeTomlMcp } = await import("./workbench-api");
    invoke.mockResolvedValue(undefined);
    await expect(upsertTomlMcp("grok-toml", "git", "uvx", ["mcp-git"])).resolves.toBeUndefined();
    expect(invoke).toHaveBeenCalledWith("upsert_toml_mcp", {
      kind: "grok-toml",
      name: "git",
      command: "uvx",
      args: ["mcp-git"],
    });
    await expect(removeTomlMcp("codex-toml", "git")).resolves.toBeUndefined();
    expect(invoke).toHaveBeenCalledWith("remove_toml_mcp", { kind: "codex-toml", name: "git" });
  });

  it("syncHubMcpServer writes mcp-json, claude-json, kimi-mcp, then upserts toml twice", async () => {
    const { syncHubMcpServer } = await import("./workbench-api");
    invoke.mockImplementation((cmd: string, args?: { kind?: string }) => {
      if (cmd === "read_agents_file") {
        if (args?.kind === "mcp-json") return Promise.resolve(JSON.stringify({ servers: [] }));
        return Promise.resolve("{}");
      }
      return Promise.resolve(undefined);
    });
    await syncHubMcpServer({
      name: "git",
      transport: "stdio",
      commandOrUrl: "uvx",
      args: ["mcp-git"],
    });
    const written = invoke.mock.calls
      .filter((c) => c[0] === "write_agents_file")
      .map((c) => (c[1] as { kind: string }).kind);
    expect(written).toEqual(["mcp-json", "claude-json", "kimi-mcp"]);
    const tomls = invoke.mock.calls.filter((c) => c[0] === "upsert_toml_mcp");
    expect(tomls).toHaveLength(2);
    expect(tomls[0]![1]).toEqual({
      kind: "grok-toml",
      name: "git",
      command: "uvx",
      args: ["mcp-git"],
    });
    expect(tomls[1]![1]).toEqual({
      kind: "codex-toml",
      name: "git",
      command: "uvx",
      args: ["mcp-git"],
    });
  });

  it("removeHubMcpServer writes catalog and lives then removes toml twice", async () => {
    const { removeHubMcpServer } = await import("./workbench-api");
    invoke.mockImplementation((cmd: string, args?: { kind?: string }) => {
      if (cmd === "read_agents_file") {
        if (args?.kind === "mcp-json") {
          return Promise.resolve(
            JSON.stringify({ servers: [{ name: "git", transport: "stdio", commandOrUrl: "uvx" }] }),
          );
        }
        return Promise.resolve("{}");
      }
      return Promise.resolve(undefined);
    });
    await removeHubMcpServer("git");
    const written = invoke.mock.calls
      .filter((c) => c[0] === "write_agents_file")
      .map((c) => (c[1] as { kind: string }).kind);
    expect(written).toEqual(["mcp-json", "claude-json", "kimi-mcp"]);
    const tomls = invoke.mock.calls.filter((c) => c[0] === "remove_toml_mcp");
    expect(tomls).toHaveLength(2);
    expect(tomls[0]![1]).toEqual({ kind: "grok-toml", name: "git" });
    expect(tomls[1]![1]).toEqual({ kind: "codex-toml", name: "git" });
  });

  it("disableHubMcpServer strips four lives and keeps catalog", async () => {
    const { disableHubMcpServer } = await import("./workbench-api");
    invoke.mockImplementation((cmd: string) => {
      if (cmd === "read_agents_file") return Promise.resolve("{}");
      return Promise.resolve(undefined);
    });
    await disableHubMcpServer("git");
    const written = invoke.mock.calls
      .filter((c) => c[0] === "write_agents_file")
      .map((c) => (c[1] as { kind: string }).kind);
    expect(written).toEqual(["claude-json", "kimi-mcp"]);
    expect(invoke.mock.calls.some((c) => c[0] === "write_agents_file" && (c[1] as { kind: string }).kind === "mcp-json")).toBe(
      false,
    );
    expect(invoke.mock.calls.filter((c) => c[0] === "remove_toml_mcp")).toHaveLength(2);
  });

  it("enableHubMcpServer re-syncs a catalog server into four lives", async () => {
    const { enableHubMcpServer } = await import("./workbench-api");
    invoke.mockImplementation((cmd: string, args?: { kind?: string }) => {
      if (cmd === "read_agents_file") {
        if (args?.kind === "mcp-json") {
          return Promise.resolve(
            JSON.stringify({ servers: [{ name: "git", transport: "stdio", commandOrUrl: "uvx", args: ["mcp-git"] }] }),
          );
        }
        return Promise.resolve("{}");
      }
      return Promise.resolve(undefined);
    });
    await enableHubMcpServer("git");
    const written = invoke.mock.calls
      .filter((c) => c[0] === "write_agents_file")
      .map((c) => (c[1] as { kind: string }).kind);
    expect(written).toEqual(["mcp-json", "claude-json", "kimi-mcp"]);
    expect(invoke.mock.calls.filter((c) => c[0] === "upsert_toml_mcp")).toHaveLength(2);
  });
});
