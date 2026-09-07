import { assetRoots, safeHtmlSrc } from "../lib/asset-src";
import { useT } from "../lib/locale-context";

/** srcdoc: scripts may run, but not as the parent origin. */
export const HTML_FRAME_SANDBOX = "allow-scripts";

/** File-backed asset:// frame: relative css/js need this origin. */
export const HTML_FRAME_FILE_SANDBOX = "allow-scripts allow-same-origin";

export function buildSrcDoc(html: string): string {
  return /<html[\s>]/i.test(html)
    ? html
    : `<!doctype html><html><head><meta charset="utf-8"><meta name="referrer" content="no-referrer"><style>html,body{margin:0;padding:12px;background:#fff;color:#111;font:14px/1.45 system-ui,sans-serif;overflow:auto}</style></head><body>${html}</body></html>`;
}

export function htmlFrameProps(opts: {
  html: string;
  path?: string | null;
  roots: string[];
  convert: (p: string) => string;
}): { src?: string; srcDoc?: string; sandbox: string } {
  const src = opts.path ? safeHtmlSrc(opts.path, opts.roots, opts.convert) ?? undefined : undefined;
  if (src) return { src, sandbox: HTML_FRAME_FILE_SANDBOX };
  return { srcDoc: buildSrcDoc(opts.html), sandbox: HTML_FRAME_SANDBOX };
}

export type HtmlArtifactPreviewProps = {
  html: string;
  title?: string;
  path?: string | null;
  cwd?: string;
  convertFileSrc: (path: string) => string;
};

/**
 * HTML preview. File-backed pages load from the asset protocol so relative
 * css/js resolve. srcdoc never gets allow-same-origin.
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
      key={frame.src ?? "srcdoc"}
      className="html-frame"
      title={heading}
      sandbox={frame.sandbox}
      referrerPolicy="no-referrer"
      {...(frame.src ? { src: frame.src } : { srcDoc: frame.srcDoc })}
    />
  );
}
