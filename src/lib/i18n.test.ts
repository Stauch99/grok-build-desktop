import { describe, expect, it } from "vitest";
import { normalizeLocale, t } from "./i18n";

describe("i18n", () => {
  it("returns zh and en hub titles", () => {
    expect(t("zh", "hub.title")).toBe("扩展中心");
    expect(t("zh", "settings.extensions")).toBe("扩展中心");
    expect(t("en", "hub.title")).toBe("Extensions");
  });

  it("falls back to the key", () => {
    expect(t("zh", "missing.thing")).toBe("missing.thing");
  });

  it("normalizes locale", () => {
    expect(normalizeLocale("en")).toBe("en");
    expect(normalizeLocale("zh")).toBe("zh");
    expect(normalizeLocale("de")).toBe("zh");
  });
});
