import { describe, expect, it } from "vitest";
import { pickFoundingKimiModel } from "./memory-founding-model";

describe("pickFoundingKimiModel", () => {
  it("prefers kimi-code/k3 over a bare k3 and over aliases", () => {
    expect(pickFoundingKimiModel(["k3", "kimi-code/k3", "ark-plan/kimi-k3"])).toBe("kimi-code/k3");
  });

  it("accepts exact k3 when the preferred id is missing", () => {
    expect(pickFoundingKimiModel(["kimi-for-coding", "k3"])).toBe("k3");
  });

  it("accepts a renamed K3 1M alias", () => {
    expect(pickFoundingKimiModel(["ark-plan/kimi-k3"])).toBe("ark-plan/kimi-k3");
  });

  it("rejects 256k and K2.7 even if they are the only rows", () => {
    expect(
      pickFoundingKimiModel(["k3-256k", "kimi-code/k3-256k", "kimi-for-coding", "kimi-for-coding-highspeed"]),
    ).toBe(null);
  });

  it("returns null on an empty catalog", () => {
    expect(pickFoundingKimiModel([])).toBe(null);
  });
});
