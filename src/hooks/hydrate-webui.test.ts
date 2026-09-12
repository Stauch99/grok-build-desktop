import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";

const root = join(dirname(fileURLToPath(import.meta.url)), "../..");

describe("hydrate-webui", () => {
  it("paints local webui.json before sessions and doctor, then hydrates them in the background", () => {
    const src = readFileSync(join(root, "src/hooks/hydrate-webui.ts"), "utf8");
    const paint = src.indexOf("d.setSettingsHydrated(true)");
    const sessions = src.indexOf("listSessions(null)");
    const doctor = src.indexOf("void doctor()");
    expect(paint).toBeGreaterThan(0);
    expect(sessions).toBeGreaterThan(paint);
    expect(doctor).toBeGreaterThan(paint);
    expect(src).toMatch(/refreshInspect\([\s\S]*?\)\.catch/);
  });
});
