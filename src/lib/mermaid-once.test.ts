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

describe("mermaid SVG cache", () => {
  beforeEach(() => {
    vi.resetModules();
  });

  it("returns the same SVG for the same source hash and theme", async () => {
    const { getMermaidSvg, setMermaidSvg } = await loadOnce();
    const source = "flowchart LR\n  A-->B";
    setMermaidSvg(source, true, "<svg id='a'/>");
    expect(getMermaidSvg(source, true)).toBe("<svg id='a'/>");
    expect(getMermaidSvg(source, false)).toBeUndefined();
  });

  it("evicts the oldest entry when the 41st unique source is stored", async () => {
    const { getMermaidSvg, setMermaidSvg } = await loadOnce();
    for (let i = 0; i < 40; i++) setMermaidSvg(`graph ${i}`, false, `<svg id='${i}'/>`);
    expect(getMermaidSvg("graph 39", false)).toBe("<svg id='39'/>");
    setMermaidSvg("graph 40", false, "<svg id='40'/>");
    expect(getMermaidSvg("graph 0", false)).toBeUndefined();
    expect(getMermaidSvg("graph 1", false)).toBe("<svg id='1'/>");
    expect(getMermaidSvg("graph 40", false)).toBe("<svg id='40'/>");
  });
});
