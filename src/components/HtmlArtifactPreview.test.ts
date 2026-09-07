import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import {
  HTML_FRAME_FILE_SANDBOX,
  HTML_FRAME_SANDBOX,
  buildSrcDoc,
  htmlFrameProps,
} from "./HtmlArtifactPreview";

describe("HTML artifact iframe sandbox lock", () => {
  it("runs scripts in srcdoc without parent same-origin", () => {
    expect(HTML_FRAME_SANDBOX).toBe("allow-scripts");
    expect(HTML_FRAME_SANDBOX).not.toContain("allow-same-origin");
  });

  it("lets a file-backed frame load relative css/js on the asset origin", () => {
    expect(HTML_FRAME_FILE_SANDBOX).toContain("allow-scripts");
    expect(HTML_FRAME_FILE_SANDBOX).toContain("allow-same-origin");
  });

  it("wraps HTML fragments in a full document", () => {
    const srcDoc = buildSrcDoc("<p>hello</p>");
    expect(srcDoc).toMatch(/<!doctype html>/i);
    expect(srcDoc).toContain("<html>");
    expect(srcDoc).toContain("<body><p>hello</p></body>");
  });

  it("preserves full HTML documents unchanged", () => {
    const full = "<!doctype html><html><head></head><body>full</body></html>";
    expect(buildSrcDoc(full)).toBe(full);
  });

  it("injects referrer no-referrer meta on wrapped documents", () => {
    const srcDoc = buildSrcDoc("<div>fragment</div>");
    expect(srcDoc).toContain('<meta name="referrer" content="no-referrer">');
  });
});

describe("htmlFrameProps", () => {
  const convert = (p: string) => `asset://localhost/${encodeURIComponent(p)}`;

  it("loads a workspace HTML file by src so relative css/js resolve", () => {
    const props = htmlFrameProps({
      html: "<link rel='stylesheet' href='_assets/kit.css'>",
      path: "/work/out/index.html",
      roots: ["/work"],
      convert,
    });
    expect(props).toEqual({
      src: "asset://localhost/%2Fwork/out/index.html",
      sandbox: HTML_FRAME_FILE_SANDBOX,
    });
    expect(new URL("_assets/kit.css", props.src!).href).toBe(
      "asset://localhost/%2Fwork/out/_assets/kit.css",
    );
  });

  it("falls back to srcdoc when there is no allowed path", () => {
    const html = "<p>hello</p>";
    const props = htmlFrameProps({ html, roots: ["/work"], convert });
    expect(props.src).toBeUndefined();
    expect(props.srcDoc).toContain("<body><p>hello</p></body>");
    expect(props.sandbox).toBe(HTML_FRAME_SANDBOX);
  });

  it("does not open a path outside the asset roots", () => {
    const props = htmlFrameProps({
      html: "<p>x</p>",
      path: "/etc/passwd",
      roots: ["/work"],
      convert,
    });
    expect(props.src).toBeUndefined();
    expect(props.sandbox).toBe(HTML_FRAME_SANDBOX);
  });
});

describe("PreviewPane HTML frame", () => {
  it("passes the file path and convertFileSrc into the artifact frame", () => {
    const src = readFileSync(new URL("./PreviewPane.tsx", import.meta.url), "utf8");
    expect(src).toMatch(/<HtmlArtifactPreview[\s\S]*path=\{displayPath\}/);
    expect(src).toMatch(/<HtmlArtifactPreview[\s\S]*convertFileSrc=\{convertFileSrc\}/);
  });
});
