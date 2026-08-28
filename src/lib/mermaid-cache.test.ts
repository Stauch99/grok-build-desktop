import { beforeEach, describe, expect, it, vi } from "vitest";

async function loadCache() {
  return import("./mermaid-cache");
}

describe("mermaid SVG cache", () => {
  beforeEach(() => {
    vi.resetModules();
  });

  it("returns the same SVG for the same source and theme", async () => {
    const { getMermaidSvg, setMermaidSvg } = await loadCache();
    setMermaidSvg("flowchart LR\n  A-->B", true, "<svg>dark</svg>");
    expect(getMermaidSvg("flowchart LR\n  A-->B", true)).toBe("<svg>dark</svg>");
    expect(getMermaidSvg("flowchart LR\n  A-->B", false)).toBeUndefined();
  });

  it("evicts the oldest entry when the 41st unique key is added", async () => {
    const { getMermaidSvg, setMermaidSvg } = await loadCache();
    for (let i = 0; i < 40; i++) setMermaidSvg(`src-${i}`, false, `<svg>${i}</svg>`);
    expect(getMermaidSvg("src-39", false)).toBe("<svg>39</svg>");

    setMermaidSvg("src-40", false, "<svg>40</svg>");
    expect(getMermaidSvg("src-0", false)).toBeUndefined();
    expect(getMermaidSvg("src-1", false)).toBe("<svg>1</svg>");
    expect(getMermaidSvg("src-40", false)).toBe("<svg>40</svg>");
  });

  it("treats a cache hit as recently used so it is not evicted next", async () => {
    const { getMermaidSvg, setMermaidSvg } = await loadCache();
    for (let i = 0; i < 40; i++) setMermaidSvg(`src-${i}`, false, `<svg>${i}</svg>`);
    expect(getMermaidSvg("src-0", false)).toBe("<svg>0</svg>");
    setMermaidSvg("src-40", false, "<svg>40</svg>");
    expect(getMermaidSvg("src-0", false)).toBe("<svg>0</svg>");
    expect(getMermaidSvg("src-1", false)).toBeUndefined();
  });
});
