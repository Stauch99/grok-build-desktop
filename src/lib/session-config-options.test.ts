import { describe, expect, it } from "vitest";
import {
  modelConfigOption,
  parseSessionConfigOptions,
  thoughtLevelConfigOption,
} from "./session-config-options";

describe("parseSessionConfigOptions", () => {
  it("returns [] for non-object results", () => {
    expect(parseSessionConfigOptions(null)).toEqual([]);
    expect(parseSessionConfigOptions("x")).toEqual([]);
    expect(parseSessionConfigOptions({})).toEqual([]);
    expect(parseSessionConfigOptions({ configOptions: "no" })).toEqual([]);
  });

  it("parses ungrouped select options", () => {
    const out = parseSessionConfigOptions({
      configOptions: [
        {
          id: "model",
          name: "Model",
          category: "model",
          type: "select",
          currentValue: "swe-1-6-fast",
          options: [
            { value: "swe-1-6-fast", name: "SWE 1.6 Fast", description: "fast + cheap" },
            { value: "claude-opus-4-8", name: "Claude Opus 4.8" },
          ],
        },
      ],
    });
    expect(out).toHaveLength(1);
    expect(out[0].id).toBe("model");
    expect(out[0].currentValue).toBe("swe-1-6-fast");
    expect(out[0].options.map((o) => o.value)).toEqual(["swe-1-6-fast", "claude-opus-4-8"]);
    expect(out[0].options[0].description).toBe("fast + cheap");
  });

  it("flattens grouped options and preserves group names", () => {
    const out = parseSessionConfigOptions({
      configOptions: [
        {
          id: "model",
          name: "Model",
          category: "model",
          type: "select",
          currentValue: "adaptive",
          options: {
            grouped: [
              {
                group: "Recommended",
                options: [{ value: "adaptive", name: "Adaptive" }],
              },
              {
                group: "Anthropic",
                options: [
                  { value: "claude-opus-4-8", name: "Claude Opus 4.8", description: "deep reasoning" },
                  { value: "claude-sonnet-4-6", name: "Claude Sonnet 4.6" },
                ],
              },
            ],
          },
        },
      ],
    });
    const opt = out[0];
    expect(opt.groups).toHaveLength(2);
    expect(opt.groups?.[1].name).toBe("Anthropic");
    expect(opt.options.map((o) => o.value)).toEqual(["adaptive", "claude-opus-4-8", "claude-sonnet-4-6"]);
  });

  it("skips malformed entries and options without a value", () => {
    const out = parseSessionConfigOptions({
      configOptions: [
        "junk",
        { id: "model", options: [{ name: "no value" }, { value: "opus" }] },
      ],
    });
    expect(out).toHaveLength(1);
    expect(out[0].options).toHaveLength(1);
    expect(out[0].options[0].value).toBe("opus");
  });
});

describe("config option pickers", () => {
  const list = parseSessionConfigOptions({
    configOptions: [
      { id: "thought_level", name: "Thinking", category: "thought_level", options: [{ value: "medium" }] },
      { id: "model", name: "Model", category: "model", options: [{ value: "opus" }] },
      { id: "other", name: "Other", category: "other", options: [{ value: "x" }] },
    ],
  });

  it("finds the model option by category", () => {
    expect(modelConfigOption(list)?.id).toBe("model");
  });

  it("finds the thought-level option", () => {
    expect(thoughtLevelConfigOption(list)?.id).toBe("thought_level");
  });

  it("falls back to id matching when category is absent", () => {
    const bare = parseSessionConfigOptions({
      configOptions: [{ id: "model", options: [{ value: "opus" }] }],
    });
    expect(modelConfigOption(bare)?.id).toBe("model");
  });
});
