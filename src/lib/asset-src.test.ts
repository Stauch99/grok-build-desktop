import { describe, expect, it } from "vitest";
import { assetPageSrc, assetRoots, isAssetAllowed, rewriteHtmlResourceUrls, rewritePreviewResourceUrl, safeFileSrc, safeHtmlSrc } from "./asset-src";

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

describe("rewritePreviewResourceUrl", () => {
  const convert = (p: string) => `asset://localhost/${encodeURIComponent(p)}`;

  it("rewrites a relative css href against the html file directory", () => {
    expect(rewritePreviewResourceUrl("_assets/kit.css", "/work/out/index.html", ["/work"], convert)).toBe(
      "asset://localhost/%2Fwork/out/_assets/kit.css",
    );
  });

  it("drops javascript, protocol-relative, and out-of-root urls", () => {
    expect(rewritePreviewResourceUrl("javascript:alert(1)", "/work/out/index.html", ["/work"], convert)).toBe("");
    expect(rewritePreviewResourceUrl("//evil.example/x", "/work/out/index.html", ["/work"], convert)).toBe("");
    expect(rewritePreviewResourceUrl("../../etc/passwd", "/work/out/index.html", ["/work"], convert)).toBe("");
  });

  it("keeps https and already-safe asset urls", () => {
    expect(rewritePreviewResourceUrl("https://example.com/a.css", "/work/out/index.html", ["/work"], convert)).toBe(
      "https://example.com/a.css",
    );
    expect(rewritePreviewResourceUrl("asset://localhost/%2Fwork/out/a.css", "/work/out/index.html", ["/work"], convert)).toBe(
      "asset://localhost/%2Fwork/out/a.css",
    );
  });
});

describe("rewriteHtmlResourceUrls", () => {
  const convert = (p: string) => `asset://localhost/${encodeURIComponent(p)}`;

  it("rewrites relative href and src in a file-backed preview", () => {
    const html = rewriteHtmlResourceUrls(
      `<link rel="stylesheet" href="_assets/kit.css"><img src="hero.png">`,
      "/work/out/index.html",
      ["/work"],
      convert,
    );
    expect(html).toContain("asset://localhost/%2Fwork/out/_assets/kit.css");
    expect(html).toContain("asset://localhost/%2Fwork/out/hero.png");
  });
});
