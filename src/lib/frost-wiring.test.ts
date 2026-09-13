import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";

const root = join(dirname(fileURLToPath(import.meta.url)), "../..");
const read = (rel: string) => readFileSync(join(root, rel), "utf8");

describe("frost wiring", () => {
  it("hydrate whitelist accepts frost", () => {
    expect(read("src/hooks/hydrate-webui.ts")).toMatch(/state\.themeFamily === "frost"/);
  });

  it("settings offers frost with a localized hint", () => {
    const settings = read("src/Settings.tsx");
    expect(settings).toMatch(/\{ value: "frost", label: "Frost", hint: t\(locale, "settings\.frostHint"\) \}/);
    expect(settings).toMatch(/themeFamily\?: "default" \| "paper" \| "ink" \| "frost"/);
  });

  it("i18n defines frostHint in both locales", () => {
    const i18n = read("src/lib/i18n.ts");
    expect(i18n).toMatch(/"settings\.frostHint": "冷灰"/);
    expect(i18n).toMatch(/"settings\.frostHint": "Cool gray"/);
  });

  it("all themeFamily unions include frost", () => {
    for (const rel of [
      "src/api.ts",
      "src/hooks/useWebuiPersist.ts",
      "src/hooks/useAppModelState.ts",
      "src/hooks/hydrate-webui.ts",
    ]) {
      expect(read(rel), rel).toMatch(/"default" \| "paper" \| "ink" \| "frost"/);
      expect(read(rel), rel).not.toMatch(/"default" \| "paper" \| "ink"(?! \|)/);
    }
  });
});
