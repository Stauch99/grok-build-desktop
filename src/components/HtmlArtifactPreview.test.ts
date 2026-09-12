import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";
import {
  HTML_FRAME_SANDBOX,
  HTML_PREVIEW_CSP,
  buildSrcDoc,
  htmlFrameProps,
} from "./HtmlArtifactPreview";

const here = dirname(fileURLToPath(import.meta.url));
const previewSrc = readFileSync(join(here, "HtmlArtifactPreview.tsx"), "utf8");

describe("HTML artifact iframe sandbox lock", () => {
  it("runs scripts in srcdoc without parent same-origin", () => {
    expect(HTML_FRAME_SANDBOX).toBe("allow-scripts");
    expect(HTML_FRAME_SANDBOX).not.toContain("allow-same-origin");
  });

  it("never grants allow-same-origin to any preview frame", () => {
    expect(previewSrc).not.toContain("allow-same-origin");
    expect(previewSrc).not.toMatch(/HTML_FRAME_FILE_SANDBOX/);
  });

  it("wraps HTML fragments in a full document", () => {
    const srcDoc = buildSrcDoc("<p>hello</p>");
    expect(srcDoc).toMatch(/<!doctype html>/i);
    expect(srcDoc).toContain("<html>");
    expect(srcDoc).toContain("<body><p>hello</p></body>");
  });

  it("preserves full HTML documents unchanged aside from CSP injection", () => {
    const full = "<!doctype html><html><head></head><body>full</body></html>";
    const srcDoc = buildSrcDoc(full);
    expect(srcDoc).toContain("<body>full</body>");
    expect(srcDoc).toContain("Content-Security-Policy");
  });

  it("injects referrer no-referrer meta on wrapped documents", () => {
    const srcDoc = buildSrcDoc("<div>fragment</div>");
    expect(srcDoc).toContain('<meta name="referrer" content="no-referrer">');
  });

  it("locks framed documents behind a connect-none preview CSP", () => {
    expect(HTML_PREVIEW_CSP).toContain("default-src 'none'");
    expect(HTML_PREVIEW_CSP).toContain("connect-src 'none'");
    expect(HTML_PREVIEW_CSP).toContain("script-src 'none'");
    expect(HTML_PREVIEW_CSP).not.toContain("unsafe-eval");
    expect(buildSrcDoc("<p>x</p>")).toContain(HTML_PREVIEW_CSP);
  });
});

describe("htmlFrameProps", () => {
  const convert = (p: string) => `asset://localhost/${encodeURIComponent(p)}`;

  it("serves workspace HTML as srcdoc so the frame is not the asset origin", () => {
    const props = htmlFrameProps({
      html: "<link rel='stylesheet' href='_assets/kit.css'><img src='hero.png'>",
      path: "/work/out/index.html",
      roots: ["/work"],
      convert,
    });
    expect(props.src).toBeUndefined();
    expect(props.sandbox).toBe(HTML_FRAME_SANDBOX);
    expect(props.sandbox).not.toContain("allow-same-origin");
    expect(props.srcDoc).toContain("asset://localhost/%2Fwork/out/_assets/kit.css");
    expect(props.srcDoc).toContain("asset://localhost/%2Fwork/out/hero.png");
    expect(props.srcDoc).toContain(HTML_PREVIEW_CSP);
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
    expect(props.srcDoc).toBeDefined();
  });

  it("drops protocol-relative and javascript resource URLs", () => {
    const props = htmlFrameProps({
      html: `<a href="//evil.example/x">x</a><img src="javascript:alert(1)">`,
      path: "/work/out/index.html",
      roots: ["/work"],
      convert,
    });
    expect(props.srcDoc).not.toContain("//evil.example");
    expect(props.srcDoc).not.toMatch(/javascript:/i);
  });
});

describe("PreviewPane HTML frame", () => {
  it("passes the file path and convertFileSrc into the artifact frame", () => {
    const src = readFileSync(join(here, "PreviewPane.tsx"), "utf8");
    expect(src).toMatch(/<HtmlArtifactPreview[\s\S]*path=\{displayPath\}/);
    expect(src).toMatch(/<HtmlArtifactPreview[\s\S]*convertFileSrc=\{convertFileSrc\}/);
  });
});
