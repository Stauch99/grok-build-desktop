import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";

const root = join(dirname(fileURLToPath(import.meta.url)), "..");

const src = readFileSync(join(root, "src/App.tsx"), "utf8");
const leaf = src.slice(
  src.indexOf("function renderSplitLeaf"),
  src.indexOf("\nreturn (", src.indexOf("function renderSplitLeaf")),
);

describe("renderSplitLeaf", () => {
  it("does not mirror the main session into an unbound extra leaf", () => {
    expect(leaf).toContain("const unbound = !isMain && !extra;");
    // An unbound extra pane must not fall back to the main session id/chat.
    expect(leaf).toContain("const sid = isMain ? sessionId : (extra?.sessionId ?? null);");
    expect(leaf).toContain("(isMain ? chat : emptyChat())");
  });

  it("renders a compact empty state for unbound extra leaves", () => {
    expect(leaf).toContain('t(locale, "pane.empty")');
    expect(leaf.indexOf('t(locale, "pane.empty")')).toBeGreaterThan(0);
    // The full doctor/onboarding empty state stays for bound panes only.
    expect(leaf).toContain("unbound ? (");
  });

  it("keeps the composer out of unbound leaves", () => {
    expect(leaf).toContain("{unbound ? null : (");
  });

  it("passes main-only composer chrome through on the main leaf", () => {
    expect(leaf).toContain("blocked={isMain ? hero.blocked || loadingSession : false}");
    expect(leaf).toContain("<ComposerDock>");
    expect(leaf).toContain('sendPrompt("/fork", paneId)');
  });
});
