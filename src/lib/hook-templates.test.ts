import { describe, expect, it } from "vitest";
import { HOOK_TEMPLATES, hookTemplateById } from "./hook-templates";

describe("hook templates", () => {
  it("ships fmt / test / notify / block-rm", () => {
    expect(HOOK_TEMPLATES.map((t) => t.id)).toEqual(["fmt", "test", "notify", "block-rm"]);
    expect(JSON.parse(hookTemplateById("block-rm")!.json).hooks.PreToolUse).toBeTruthy();
  });
});
