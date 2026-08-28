import { describe, expect, it } from "vitest";
import { HTML_FRAME_SANDBOX, buildSrcDoc } from "./HtmlArtifactPreview";

describe("HTML artifact iframe sandbox lock", () => {
  it("keeps sandbox empty with no privilege tokens", () => {
    expect(HTML_FRAME_SANDBOX).toBe("");
    expect(HTML_FRAME_SANDBOX).not.toContain("allow-same-origin");
    expect(HTML_FRAME_SANDBOX).not.toContain("allow-scripts");
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
