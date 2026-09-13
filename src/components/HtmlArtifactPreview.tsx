import { useEffect, useRef } from "react";
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

/**
 * Console probe injected ahead of artifact markup when `consoleProbe` is on.
 * It wraps console.error/warn and listens for error/unhandledrejection, then
 * postMessages `{type:"grok-console",level,args}` to the parent window.
 * Kept tiny and fixed — its sha256 is the only script the probe CSP allows,
 * so artifact JS stays blocked exactly as before.
 */
export const HTML_CONSOLE_PROBE_SRC = `(function(){var P=parent,M=function(v){if(typeof v==="string")return v.slice(0,500);try{return JSON.stringify(v).slice(0,500)}catch(e){return String(v).slice(0,500)}},S=function(l,a){try{P.postMessage({type:"grok-console",level:l,args:a},"*")}catch(e){}},G=function(a){var o=[];for(var i=0;i<a.length&&i<8;i++)o.push(M(a[i]));return o};["error","warn"].forEach(function(l){var o=console[l].bind(console);console[l]=function(){S(l,G(arguments));o.apply(null,arguments)}});addEventListener("unhandledrejection",function(e){S("error",["unhandledrejection: "+M(e.reason)])});addEventListener("error",function(e){if(e&&e.message){S("error",[e.message+(e.filename?" @ "+e.filename+":"+(e.lineno||0):"")])}else{var t=e&&e.target;if(t&&t!==window&&t.tagName)S("error",["resource error: "+t.tagName.toLowerCase()+" "+(t.src||t.href||"")])}},true)})()`;

/** sha256 over HTML_CONSOLE_PROBE_SRC — update if the probe text changes. */
export const HTML_CONSOLE_PROBE_SHA256 = "ysfEbEngmmxMvAVtz6na2WztX28Jd4qMOMjpqlh2upw=";

/** Preview CSP variant that runs only the console probe — artifact JS still blocked. */
export const HTML_PREVIEW_PROBE_CSP = HTML_PREVIEW_CSP.replace(
  "script-src 'none'",
  `script-src 'sha256-${HTML_CONSOLE_PROBE_SHA256}'`,
);

const PREVIEW_PROBE_META = `<meta http-equiv="Content-Security-Policy" content="${HTML_PREVIEW_PROBE_CSP}">`;
const PROBE_TAG = `<script>${HTML_CONSOLE_PROBE_SRC}</script>`;

export function injectPreviewCsp(html: string, head = PREVIEW_CSP_META): string {
  if (/<head[^>]*>/i.test(html)) {
    return html.replace(/<head([^>]*)>/i, `<head$1>${head}`);
  }
  if (/<html[\s>]/i.test(html)) {
    return html.replace(/<html([^>]*)>/i, `<html$1><head>${head}</head>`);
  }
  return `${head}${html}`;
}

export function buildSrcDoc(html: string, probe = false): string {
  const doc = /<html[\s>]/i.test(html)
    ? html
    : `<!doctype html><html><head><meta charset="utf-8"><meta name="referrer" content="no-referrer"><style>html,body{margin:0;padding:12px;background:#fff;color:#111;font:14px/1.45 system-ui,sans-serif;overflow:auto}</style></head><body>${html}</body></html>`;
  return injectPreviewCsp(doc, probe ? `${PREVIEW_PROBE_META}${PROBE_TAG}` : PREVIEW_CSP_META);
}

/** A console line reported by the probe inside the preview frame. */
export type HtmlConsoleEntry = { level: "error" | "warn"; text: string; at: number };

export function htmlFrameProps(opts: {
  html: string;
  path?: string | null;
  roots: string[];
  convert: (p: string) => string;
  consoleProbe?: boolean;
}): { src?: string; srcDoc?: string; sandbox: string } {
  const allowedPath = opts.path && isAssetAllowed(opts.path, opts.roots) ? opts.path : undefined;
  const html = rewriteHtmlResourceUrls(opts.html, allowedPath, opts.roots, opts.convert);
  return { srcDoc: buildSrcDoc(html, opts.consoleProbe === true), sandbox: HTML_FRAME_SANDBOX };
}

export type HtmlArtifactPreviewProps = {
  html: string;
  title?: string;
  path?: string | null;
  cwd?: string;
  convertFileSrc: (path: string) => string;
  /** When set, injects the console probe and reports {type:"grok-console"} posts. */
  onConsoleEntry?: (entry: HtmlConsoleEntry) => void;
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
  onConsoleEntry,
}: HtmlArtifactPreviewProps) {
  const t = useT();
  const frameRef = useRef<HTMLIFrameElement>(null);
  const heading = title?.trim() || t("preview.heading");
  const frame = htmlFrameProps({
    html,
    path,
    roots: assetRoots(cwd ?? "", ""),
    convert: convertFileSrc,
    consoleProbe: !!onConsoleEntry,
  });

  useEffect(() => {
    if (!onConsoleEntry) return;
    const onMessage = (e: MessageEvent) => {
      const frame = frameRef.current;
      if (!frame || e.source !== frame.contentWindow) return;
      const data = e.data as { type?: unknown; level?: unknown; args?: unknown } | null;
      if (!data || data.type !== "grok-console") return;
      const args = Array.isArray(data.args) ? data.args : [data.args ?? ""];
      onConsoleEntry({
        level: data.level === "warn" ? "warn" : "error",
        text: args.map((a) => String(a)).join(" ").slice(0, 2000),
        at: Date.now(),
      });
    };
    window.addEventListener("message", onMessage);
    return () => window.removeEventListener("message", onMessage);
  }, [onConsoleEntry]);

  return (
    <iframe
      ref={frameRef}
      key={path ?? "srcdoc"}
      className="html-frame"
      title={heading}
      sandbox={frame.sandbox}
      referrerPolicy="no-referrer"
      srcDoc={frame.srcDoc}
    />
  );
}
