import { convertFileSrc } from "@tauri-apps/api/core";
import { lazy, memo, Suspense, useId, type MouseEventHandler } from "react";
import { assetRoots, safeFileSrc } from "../lib/asset-src";
import { memoizeMarkdown } from "../lib/markdown-cache";
import { splitAssistantBlocks } from "../lib/markdown";
import { renderLiveMarkdownThrottled } from "../lib/live-markdown-cache";

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
  const htmlFor = (md: string, idx: number) => {
    const last = idx === blocks.length - 1;
    return live && last
      ? renderLiveMarkdownThrottled(`${blockId}-${idx}`, md, cwd, toSrc)
      : memoizeMarkdown(md, cwd, toSrc);
  };
  return (
    <div className={className} data-live={live ? "" : undefined} onClick={onClick}>
      {blocks.map((b, i) =>
        b.kind === "mermaid" ? (
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
        ) : (
          <div
            key={`md-${i}`}
            dangerouslySetInnerHTML={{ __html: htmlFor(b.text, i) }}
          />
        ),
      )}
    </div>
  );
});
