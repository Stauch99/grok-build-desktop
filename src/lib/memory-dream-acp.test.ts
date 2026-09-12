import { describe, expect, it } from "vitest";
import {
  FOUNDING_PROMPT_TIMEOUT_MS,
  NIGHTLY_PROMPT_TIMEOUT_MS,
  foundingBootstrapPrompts,
} from "./memory-dream-acp";

describe("founding ACP helpers", () => {
  it("switches to K3 then max effort", () => {
    expect(foundingBootstrapPrompts("kimi-code/k3")).toEqual(["/model kimi-code/k3", "/effort max"]);
  });

  it("keeps founding timeout longer than nightly", () => {
    expect(FOUNDING_PROMPT_TIMEOUT_MS).toBe(45 * 60 * 1000);
    expect(NIGHTLY_PROMPT_TIMEOUT_MS).toBe(10 * 60 * 1000);
    expect(FOUNDING_PROMPT_TIMEOUT_MS).toBeGreaterThan(NIGHTLY_PROMPT_TIMEOUT_MS);
  });
});
