import { describe, expect, it } from "vitest";
import { assetPageSrc, assetRoots, isAssetAllowed, safeFileSrc, safeHtmlSrc } from "./asset-src";

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

describe("assetPageSrc", () => {
  const convert = (p: string) => `asset://localhost/${encodeURIComponent(p)}`;

  it("keeps path segments so relative css resolves next to the html file", () => {
    const src = assetPageSrc("/work/out/index.html", convert);
    expect(src).toBe("asset://localhost/%2Fwork/out/index.html");
    expect(new URL("_assets/kit.css", src!).href).toBe("asset://localhost/%2Fwork/out/_assets/kit.css");
  });

  it("does not collapse the directory the way convertFileSrc encoding does", () => {
    const encoded = convert("/work/out/index.html");
    expect(new URL("_assets/kit.css", encoded).href).toBe("asset://localhost/_assets/kit.css");
  });

  it("encodes spaces in iCloud-style segments without flattening slashes", () => {
    const src = assetPageSrc("/Users/me/Mobile Documents/Vault/lecture-01.html", convert);
    expect(src).toBe("asset://localhost/%2FUsers/me/Mobile%20Documents/Vault/lecture-01.html");
    expect(new URL("_assets/kit.css", src!).href).toContain("/Vault/_assets/kit.css");
  });

  it("uses the https asset origin when convertFileSrc is on Windows", () => {
    const win = (p: string) => `https://asset.localhost/${encodeURIComponent(p)}`;
    expect(assetPageSrc("/work/out/index.html", win)).toBe(
      "https://asset.localhost/%2Fwork/out/index.html",
    );
  });
});

describe("safeHtmlSrc", () => {
  const convert = (p: string) => `asset://localhost/${encodeURIComponent(p)}`;

  it("returns a page url inside the workspace and null outside", () => {
    expect(safeHtmlSrc("/work/out/index.html", ["/work"], convert)).toBe(
      "asset://localhost/%2Fwork/out/index.html",
    );
    expect(safeHtmlSrc("/etc/passwd", ["/work"], convert)).toBeNull();
  });
});
