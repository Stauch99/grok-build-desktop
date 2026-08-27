import { describe, expect, it } from "vitest";
import { mergeModelCatalog, modelsFromCache, parseModelsList } from "./models";

describe("parseModelsList", () => {
  it("reads starred default and dashed rows", () => {
    const rows = parseModelsList(`Default model: grok-4.6\n\nAvailable models:\n  * grok-4.6 (default)\n  - grok-4.5\n`);
    expect(rows.map((r) => r.id)).toEqual(["grok-4.6", "grok-4.5"]);
    expect(rows[0]?.isDefault).toBe(true);
  });
});

describe("modelsFromCache", () => {
  it("skips hidden models", () => {
    const rows = modelsFromCache({
      models: {
        "grok-4.6": { info: { id: "grok-4.6", name: "Grok 4.6" } },
        hidden: { info: { id: "hidden", hidden: true } },
      },
    });
    expect(rows.map((r) => r.id)).toEqual(["grok-4.6"]);
  });
});

describe("mergeModelCatalog", () => {
  it("dedupes and keeps fallbacks", () => {
    expect(mergeModelCatalog([{ id: "grok-4.6" }], [{ id: "grok-4.6" }, { id: "grok-4.5" }], ["grok-build"])).toEqual([
      "grok-4.6",
      "grok-4.5",
      "grok-build",
    ]);
  });
});
