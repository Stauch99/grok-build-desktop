import { convertFileSrc } from "@tauri-apps/api/core";
import { lazy, memo, Suspense, useId, useState, type MouseEventHandler } from "react";
import { assetRoots, safeFileSrc } from "../lib/asset-src";
import { memoizeMarkdown } from "../lib/markdown-cache";
import { splitAssistantBlocks } from "../lib/markdown";
import { splitCodeSegments } from "../lib/code-segments";
import { renderLiveMarkdownThrottled } from "../lib/live-markdown-cache";
import { IconCheck, IconCopy } from "../icons";
import { useT } from "../lib/locale-context";

const MermaidBlock = lazy(() => import("./MermaidBlock"));

export type MarkdownProps = {
  text: string;
  dark: boolean;
  className?: string;
  cwd?: string;
  onClick?: MouseEventHandler<HTMLDivElement>;
  /** Skip the LRU cache while this turn is still streaming. */
  live?: boolean;
};

/** Slim header over a fenced code block: language left, copy button right. */
function CodeBlock({
  lang,
  code,
  header,
}: {
  lang: string;
  code: string;
  /** False for the trailing block while the turn is still streaming. */
  header: boolean;
}) {
  const t = useT();
  const [copied, setCopied] = useState(false);
  const copy = () => {
    void navigator.clipboard.writeText(code).then(() => {
      setCopied(true);
      window.setTimeout(() => setCopied(false), 1000);
    });
  };
  return (
    <div className="code-block">
      {header ? (
        <div className="code-head">
          <span className="code-lang">{lang || t("thread.code")}</span>
          <button
            type="button"
            className="code-copy"
            aria-label={copied ? t("toast.copied") : t("thread.copy")}
            onClick={copy}
          >
            {copied ? <IconCheck size={12} /> : <IconCopy size={12} />}
          </button>
        </div>
      ) : null}
      {/* marked emits `language-{lang}` and a trailing newline; match that. */}
      <pre>
        <code className={lang ? `language-${lang}` : undefined}>{`${code}\n`}</code>
      </pre>
    </div>
  );
}

/**
 * Shared markdown surface for assistant replies and file previews, so a
 * README renders in the preview pane exactly as it would in the thread —
 * including mermaid diagrams and clickable local paths.
 */
export const Markdown = memo(function Markdown({
  text,
  dark,
  className = "md",
  cwd = "",
  onClick,
  live = false,
}: MarkdownProps) {
  const blockId = useId();
  const blocks = splitAssistantBlocks(text);
  const roots = assetRoots(cwd, "");
  const toSrc = (path: string) => safeFileSrc(path, roots, convertFileSrc) ?? "";
  const htmlFor = (md: string, key: string, last: boolean) =>
    live && last
      ? renderLiveMarkdownThrottled(key, md, cwd, toSrc)
      : memoizeMarkdown(md, cwd, toSrc);
  return (
    <div className={className} data-live={live ? "" : undefined} onClick={onClick}>
      {blocks.map((b, i) => {
        if (b.kind === "mermaid") {
          return (
            <Suspense
              key={`mmd-${i}`}
              fallback={
                <div className="mermaid-fallback">
                  <pre>
                    <code>{b.text}</code>
                  </pre>
                </div>
              }
            >
              <MermaidBlock text={b.text} closed={b.closed} dark={dark} />
            </Suspense>
          );
        }
        const last = i === blocks.length - 1;
        const segs = splitCodeSegments(b.text);
        if (segs.length === 1 && segs[0].kind === "md") {
          return (
            <div
              key={`md-${i}`}
              dangerouslySetInnerHTML={{ __html: htmlFor(b.text, `${blockId}-${i}`, last) }}
            />
          );
        }
        return (
          <div key={`md-${i}`}>
            {segs.map((s, j) =>
              s.kind === "code" ? (
                <CodeBlock
                  key={`code-${j}`}
                  lang={s.lang}
                  code={s.code}
                  header={!(live && last && j === segs.length - 1)}
                />
              ) : (
                <div
                  key={`seg-${j}`}
                  dangerouslySetInnerHTML={{
                    __html: htmlFor(s.text, `${blockId}-${i}-${j}`, last),
                  }}
                />
              ),
            )}
          </div>
        );
      })}
    </div>
  );
});
