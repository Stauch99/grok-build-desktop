import { assetRoots, isAssetAllowed, rewriteHtmlResourceUrls } from "../lib/asset-src";
import { useT } from "../lib/locale-context";

/** srcdoc: scripts may run at the iframe layer, but not as the parent origin. */
export const HTML_FRAME_SANDBOX = "allow-scripts";

/**
 * Extra policy for framed preview documents. Intersects with the shell CSP.
 * `script-src 'none'` stops artifact JS; `connect-src 'none'` stops beacons.
 */
export const HTML_PREVIEW_CSP =
  "default-src 'none'; script-src 'none'; style-src 'unsafe-inline'; img-src asset: http://asset.localhost https://asset.localhost data:; media-src asset: http://asset.localhost https://asset.localhost; font-src data:; connect-src 'none'; frame-src 'none'; object-src 'none'; base-uri 'none'; form-action 'none'";

const PREVIEW_CSP_META = `<meta http-equiv="Content-Security-Policy" content="${HTML_PREVIEW_CSP}">`;

export function injectPreviewCsp(html: string): string {
  if (/<head[^>]*>/i.test(html)) {
    return html.replace(/<head([^>]*)>/i, `<head$1>${PREVIEW_CSP_META}`);
  }
  if (/<html[\s>]/i.test(html)) {
    return html.replace(/<html([^>]*)>/i, `<html$1><head>${PREVIEW_CSP_META}</head>`);
  }
  return `${PREVIEW_CSP_META}${html}`;
}

export function buildSrcDoc(html: string): string {
  const doc = /<html[\s>]/i.test(html)
    ? html
    : `<!doctype html><html><head><meta charset="utf-8"><meta name="referrer" content="no-referrer"><style>html,body{margin:0;padding:12px;background:#fff;color:#111;font:14px/1.45 system-ui,sans-serif;overflow:auto}</style></head><body>${html}</body></html>`;
  return injectPreviewCsp(doc);
}

export function htmlFrameProps(opts: {
  html: string;
  path?: string | null;
  roots: string[];
  convert: (p: string) => string;
}): { src?: string; srcDoc?: string; sandbox: string } {
  const allowedPath = opts.path && isAssetAllowed(opts.path, opts.roots) ? opts.path : undefined;
  const html = rewriteHtmlResourceUrls(opts.html, allowedPath, opts.roots, opts.convert);
  return { srcDoc: buildSrcDoc(html), sandbox: HTML_FRAME_SANDBOX };
}

export type HtmlArtifactPreviewProps = {
  html: string;
  title?: string;
  path?: string | null;
  cwd?: string;
  convertFileSrc: (path: string) => string;
};

/**
 * HTML preview. File-backed pages are rewritten into srcdoc so relative
 * css/images still resolve via the asset protocol. The iframe sandbox never
 * includes same-origin, so the frame cannot read the asset origin.
 */
export function HtmlArtifactPreview({
  html,
  title,
  path,
  cwd,
  convertFileSrc,
}: HtmlArtifactPreviewProps) {
  const t = useT();
  const heading = title?.trim() || t("preview.heading");
  const frame = htmlFrameProps({
    html,
    path,
    roots: assetRoots(cwd ?? "", ""),
    convert: convertFileSrc,
  });

  return (
    <iframe
      key={path ?? "srcdoc"}
      className="html-frame"
      title={heading}
      sandbox={frame.sandbox}
      referrerPolicy="no-referrer"
      srcDoc={frame.srcDoc}
    />
  );
}
