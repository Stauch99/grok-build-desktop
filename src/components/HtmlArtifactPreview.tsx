export type HtmlArtifactPreviewProps = {
  html: string;
  title?: string;
};

/**
 * Sandboxed HTML preview. Empty sandbox = no privileges. Not a live app host.
 */
export function HtmlArtifactPreview({ html, title }: HtmlArtifactPreviewProps) {
  const heading = title?.trim() || "预览";
  const srcDoc = /<html[\s>]/i.test(html)
    ? html
    : `<!doctype html><html><head><meta charset="utf-8"><meta name="referrer" content="no-referrer"><style>html,body{margin:0;padding:12px;background:#fff;color:#111;font:14px/1.45 system-ui,sans-serif;overflow:auto}</style></head><body>${html}</body></html>`;

  return (
    <iframe
      className="html-frame"
      title={heading}
      sandbox=""
      referrerPolicy="no-referrer"
      srcDoc={srcDoc}
    />
  );
}
