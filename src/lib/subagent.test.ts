import { describe, expect, it } from "vitest";
import { mcpInheritanceLabel, subagentStatusFromTool } from "./subagent";

describe("subagentStatusFromTool", () => {
  it("maps spawn_subagent statuses", () => {
    expect(subagentStatusFromTool("spawn_subagent", "in_progress")).toBe("running");
    expect(subagentStatusFromTool("spawn_subagent", "pending")).toBe("running");
    expect(subagentStatusFromTool("spawn_subagent", "completed")).toBe("completed");
    expect(subagentStatusFromTool("spawn_subagent", "cancelled")).toBe("cancelled");
    expect(subagentStatusFromTool("spawn_subagent", "canceled")).toBe("cancelled");
    expect(subagentStatusFromTool("spawn_subagent", "failed")).toBe("failed");
  });

  it("maps get_command_or_subagent_output titles", () => {
    expect(subagentStatusFromTool("get_command_or_subagent_output", "running")).toBe("running");
    expect(subagentStatusFromTool("get_command_or_subagent_output (1)", "completed")).toBe("completed");
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
