import { describe, expect, it } from "vitest";
import { childSessionIdFromToolDetail, isSubagentPollTool, mcpInheritanceLabel, subagentDisplayName, subagentStatusFromItem, subagentStatusFromTool } from "./subagent";

describe("subagentStatusFromTool", () => {
  it("maps spawn_subagent statuses", () => {
    expect(subagentStatusFromTool("spawn_subagent", "in_progress")).toBe("running");
    expect(subagentStatusFromTool("spawn_subagent", "pending")).toBe("running");
    expect(subagentStatusFromTool("spawn_subagent", "completed")).toBe("completed");
    expect(subagentStatusFromTool("spawn_subagent", "cancelled")).toBe("cancelled");
    expect(subagentStatusFromTool("spawn_subagent", "canceled")).toBe("cancelled");
    expect(subagentStatusFromTool("spawn_subagent", "failed")).toBe("failed");
  });

  it("does not treat output polls as independent subagents", () => {
    expect(subagentStatusFromTool("get_command_or_subagent_output", "running")).toBeNull();
    expect(subagentStatusFromTool("get_command_or_subagent_output (1)", "completed")).toBeNull();
    expect(
      subagentStatusFromItem({
        title: "Execute `git rev-parse HEAD`",
        status: "in_progress",
        toolName: "get_command_or_subagent_output",
      }),
    ).toBeNull();
  });

  it("treats Grok Get task output as a poll, not a spawn", () => {
    expect(isSubagentPollTool("Get task output: 01abc")).toBe(true);
    expect(isSubagentPollTool("Get task output")).toBe(true);
  });

  it("accepts spaced or dashed titles", () => {
    expect(subagentStatusFromTool("Spawn Subagent", "IN_PROGRESS")).toBe("running");
    expect(subagentStatusFromTool("spawn-subagent: researcher", "success")).toBe("completed");
  });

  it("ignores unrelated tools", () => {
    expect(subagentStatusFromTool("bash", "completed")).toBeNull();
    expect(subagentStatusFromTool("subagent", "running")).toBeNull();
  });

  it("returns null for an unknown status even on a matching title", () => {
    expect(subagentStatusFromTool("spawn_subagent", "queued")).toBeNull();
  });

  it("maps Claude Task and Agent titles", () => {
    expect(subagentStatusFromTool("Task: 中文技巧", "in_progress")).toBe("running");
    expect(subagentStatusFromTool("Agent", "pending")).toBe("running");
    expect(subagentStatusFromTool("task", "completed")).toBe("completed");
  });

  it("maps Kimi swarm titles", () => {
    expect(subagentStatusFromTool("swarm", "in_progress", "kimi")).toBe("running");
  });

  it("still matches after Grok overwrites spawn_subagent with the task description", () => {
    expect(
      subagentStatusFromItem(
        { title: "解读 Attention Is All You Need", status: "in_progress", toolName: "spawn_subagent" },
        "grok",
      ),
    ).toBe("running");
    expect(
      subagentStatusFromTool("解读 Attention Is All You Need", "in_progress", "grok"),
    ).toBeNull();
  });

  it("still ignores bash and a bare subagent token", () => {
    expect(subagentStatusFromTool("bash", "in_progress")).toBeNull();
    expect(subagentStatusFromTool("subagent", "running")).toBeNull();
  });
});

describe("subagentDisplayName", () => {
  it("strips alias prefixes for display names", () => {
    expect(subagentDisplayName("Task: 中文技巧")).toBe("中文技巧");
    expect(subagentDisplayName("spawn_subagent researcher")).toBe("researcher");
    expect(subagentDisplayName("Agent")).toBe("Agent");
  });
});

describe("childSessionIdFromToolDetail", () => {
  it("reads Grok spawn output", () => {
    expect(
      childSessionIdFromToolDetail(
        "Subagent started in background.\nsubagent_id: 01a0787b-8ce7-7253-9afb-f0f8c55334c5\ntype: general-purpose",
      ),
    ).toBe("01a0787b-8ce7-7253-9afb-f0f8c55334c5");
  });

  it("returns null when the spawn id is missing", () => {
    expect(childSessionIdFromToolDetail("still starting")).toBeNull();
    expect(childSessionIdFromToolDetail("")).toBeNull();
  });
});

describe("mcpInheritanceLabel", () => {
  it("defaults to inherit", () => {
    expect(mcpInheritanceLabel()).toBe("inherit");
    expect(mcpInheritanceLabel("")).toBe("inherit");
    expect(mcpInheritanceLabel("inherit")).toBe("inherit");
  });

  it("reads none", () => {
    expect(mcpInheritanceLabel("none")).toBe("none");
    expect(mcpInheritanceLabel("NONE")).toBe("none");
    expect(mcpInheritanceLabel("false")).toBe("none");
  });
});
