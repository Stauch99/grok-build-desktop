import { describe, expect, it } from "vitest";
import { assetRoots, isAssetAllowed, safeFileSrc } from "./asset-src";

describe("asset-src", () => {
  const roots = assetRoots("/Users/me/proj", "/Users/me/.grok");
  it("allows workspace and grok sessions", () => {
    expect(isAssetAllowed("/Users/me/proj/shot.png", roots)).toBe(true);
    expect(isAssetAllowed("/Users/me/.grok/sessions/a/cover.png", roots)).toBe(true);
  });
  it("rejects home and ssh", () => {
    expect(isAssetAllowed("/Users/me/secret.png", roots)).toBe(false);
    expect(isAssetAllowed("/Users/me/.ssh/id_rsa", roots)).toBe(false);
  });
  it("safeFileSrc returns null outside roots", () => {
    expect(safeFileSrc("/etc/passwd", roots, (p) => `asset://${p}`)).toBeNull();
    expect(safeFileSrc("/Users/me/proj/a.png", roots, (p) => `asset://${p}`)).toBe("asset:///Users/me/proj/a.png");
  });
  it("allows grok sessions when grokHome is unknown", () => {
    const unknown = assetRoots("/Users/me/proj", "");
    expect(isAssetAllowed("/Users/x/.grok/sessions/a/cover.png", unknown)).toBe(true);
    expect(isAssetAllowed("/Users/me/secret.png", unknown)).toBe(false);
  });
  it("when cwd is unknown, only grok sessions are allowed", () => {
    const none = assetRoots("", "");
    expect(isAssetAllowed("/Users/me/proj/shot.png", none)).toBe(false);
    expect(isAssetAllowed("/Users/me/.grok/sessions/a/cover.png", none)).toBe(true);
  });
  it("rejects path traversal out of the workspace", () => {
    expect(isAssetAllowed("/Users/me/proj/../secret.png", roots)).toBe(false);
    expect(isAssetAllowed("/Users/me/proj/../../.ssh/id_rsa", roots)).toBe(false);
  });
  it("does not treat a prefix sibling as inside the root", () => {
    expect(isAssetAllowed("/Users/me/proj-evil/shot.png", roots)).toBe(false);
  });
});
