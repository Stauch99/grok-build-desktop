import { describe, expect, it } from "vitest";
import {
  CLAUDE_EFFORTS,
  GROK_EFFORTS,
  catalogFromSource,
  effortsForModel,
  emptyCatalog,
  modelLabelMap,
  snapModelChange,
} from "./agent-models";

describe("catalogFromSource grok", () => {
  it("merges grok models output, cache, prefs, and fallbacks", () => {
    const catalog = catalogFromSource({
      agentId: "grok",
      grokList: "* grok-4.6 (default)\n- grok-4.5\n",
      grokCache: { models: { "grok-build": { info: { id: "grok-build", name: "Grok Build" } } } },
      grokPrefs: { model: "grok-4.5", effort: "xhigh" },
    });
    expect(catalog.models.map((m) => m.id)).toEqual(["grok-4.6", "grok-4.5", "grok-build"]);
    expect(catalog.currentModel).toBe("grok-4.5");
    expect(catalog.currentEffort).toBe("xhigh");
    expect(catalog.models.every((m) => m.efforts.join() === GROK_EFFORTS.join())).toBe(true);
  });
});

describe("catalogFromSource kimi", () => {
  it("uses per-model effort ladders from the sanitized CLI excerpt", () => {
    const catalog = catalogFromSource({
      agentId: "kimi",
      kimi: {
        currentModel: "kimi-code/k3",
        currentEffort: "high",
        models: [
          {
            id: "kimi-code/k3",
            label: "Kimi K3",
            efforts: ["low", "high", "max"],
            defaultEffort: "high",
          },
          {
            id: "custom/qwen",
            label: "Qwen",
            efforts: ["low", "medium", "high", "xhigh", "none"],
            defaultEffort: "medium",
          },
        ],
      },
    });
    expect(catalog.currentModel).toBe("kimi-code/k3");
    expect(catalog.currentEffort).toBe("high");
    expect(effortsForModel(catalog.models, "kimi-code/k3")).toEqual(["low", "high", "max"]);
    expect(modelLabelMap(catalog.models)["kimi-code/k3"]).toBe("Kimi K3");
    expect(snapModelChange(catalog.models, "custom/qwen", "max")).toEqual({
      model: "custom/qwen",
      effort: "medium",
    });
  });

  it("keeps a current model that is missing from the table", () => {
    const catalog = catalogFromSource({
      agentId: "kimi",
      kimi: { currentModel: "kimi-code/k2", currentEffort: "low", models: [] },
    });
    expect(catalog.models[0]?.id).toBe("kimi-code/k2");
    expect(catalog.currentModel).toBe("kimi-code/k2");
  });
});

describe("catalogFromSource claude", () => {
  it("keeps opus[1m] and the six-rung effort ladder including ultracode", () => {
    const catalog = catalogFromSource({
      agentId: "claude",
      claude: { model: "opus[1m]", effortLevel: "ultracode" },
    });
    expect(catalog.currentModel).toBe("opus[1m]");
    expect(catalog.currentEffort).toBe("ultracode");
    expect(catalog.models.map((m) => m.id)).toEqual(["opus[1m]", "opus", "sonnet", "haiku", "fable"]);
    expect(effortsForModel(catalog.models, "opus[1m]")).toEqual(CLAUDE_EFFORTS);
    expect(CLAUDE_EFFORTS).toContain("ultracode");
  });
});

describe("catalogFromSource devin", () => {
  it("ships the static model list with adaptive as default and no effort ladder", () => {
    const catalog = catalogFromSource({ agentId: "devin" });
    const ids = catalog.models.map((m) => m.id);
    expect(ids).toContain("adaptive");
    expect(ids).toContain("fusion");
    expect(ids).toContain("swe-1-6-fast");
    expect(ids).toContain("claude-opus-4-8");
    expect(ids).toContain("gpt-5.4");
    expect(ids).toContain("gemini-3.1-pro-preview");
    expect(catalog.models[0].label).toBe("Adaptive");
    expect(catalog.models.find((m) => m.id === "adaptive")?.isDefault).toBe(true);
    expect(catalog.currentModel).toBe("adaptive");
    expect(catalog.currentEffort).toBe("");
    expect(effortsForModel(catalog.models, "adaptive")).toEqual([]);
  });

  it("reads the current model from config.json and keeps unknown ids", () => {
    const catalog = catalogFromSource({
      agentId: "devin",
      devin: { currentModel: " swe " },
    });
    expect(catalog.currentModel).toBe("swe");
    const custom = catalogFromSource({
      agentId: "devin",
      devin: { currentModel: "swe-1.6" },
    });
    expect(custom.currentModel).toBe("swe-1.6");
    expect(custom.models[0]?.id).toBe("swe-1.6");
  });

  it("emptyCatalog falls back to adaptive for devin", () => {
    const catalog = emptyCatalog("devin");
    expect(catalog.currentModel).toBe("adaptive");
    expect(catalog.models.map((m) => m.id)).toContain("adaptive");
  });
});

describe("catalogFromSource codex", () => {
  it("reads per-model reasoning levels from the slim cache", () => {
    const catalog = catalogFromSource({
      agentId: "codex",
      codex: {
        currentModel: "gpt-5.4",
        currentEffort: "high",
        models: [
          {
            id: "gpt-5.4",
            label: "GPT-5.4",
            efforts: ["low", "medium", "high", "xhigh"],
            defaultEffort: "medium",
          },
        ],
      },
    });
    expect(catalog.currentModel).toBe("gpt-5.4");
    expect(catalog.currentEffort).toBe("high");
    expect(effortsForModel(catalog.models, "gpt-5.4")).toEqual(["low", "medium", "high", "xhigh"]);
  });
});
