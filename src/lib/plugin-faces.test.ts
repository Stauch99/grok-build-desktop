import { describe, expect, it } from "vitest";
import { splitPluginFaces, type PluginFace } from "./plugin-faces";

describe("splitPluginFaces", () => {
  it("splits toggleable plugins from read-only inventory", () => {
    const plugins: PluginFace[] = [
      { name: "fmt", enabled: true, trusted: true, provides: { skills: 2 } },
      { name: "blocked", enabled: false, trusted: false, provides: { mcpServers: 1 } },
    ];
    const { configurable, inventory } = splitPluginFaces(plugins);
    expect(configurable.map((p) => p.name)).toEqual(["fmt"]);
    expect(inventory.map((p) => p.name)).toEqual(["fmt", "blocked"]);
  });
});
