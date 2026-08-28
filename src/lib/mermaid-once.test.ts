import { beforeEach, describe, expect, it, vi } from "vitest";

async function loadOnce() {
  return import("./mermaid-once");
}

describe("loadMermaid", () => {
  beforeEach(() => {
    vi.resetModules();
  });

  it("returns the same module promise on repeated calls", async () => {
    const { loadMermaid } = await loadOnce();
    const first = loadMermaid();
    const second = loadMermaid();
    expect(second).toBe(first);
    const mod = await first;
    expect(typeof mod.default.render).toBe("function");
  });
});
