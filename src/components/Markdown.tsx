import { convertFileSrc } from "@tauri-apps/api/core";
import type { MouseEventHandler } from "react";
import { assetRoots, safeFileSrc } from "../lib/asset-src";
import { renderMd, splitAssistantBlocks } from "../lib/markdown";
import { MermaidBlock } from "../MermaidBlock";

export type MarkdownProps = {
  text: string;
  dark: boolean;
  className?: string;
  cwd?: string;
  onClick?: MouseEventHandler<HTMLDivElement>;
};

/**
 * Shared markdown surface for assistant replies and file previews, so a
 * README renders in the preview pane exactly as it would in the thread —
 * including mermaid diagrams and clickable local paths.
 */
export function Markdown({ text, dark, className = "md", cwd = "", onClick }: MarkdownProps) {
  const blocks = splitAssistantBlocks(text);
  const roots = assetRoots(cwd, "");
  const toSrc = (path: string) => safeFileSrc(path, roots, convertFileSrc) ?? "";
  return (
    <div className={className} onClick={onClick}>
      {blocks.map((b, i) =>
        b.kind === "mermaid" ? (
          <MermaidBlock key={`mmd-${i}`} text={b.text} closed={b.closed} dark={dark} />
        ) : (
          <div
            key={`md-${i}`}
            dangerouslySetInnerHTML={{ __html: renderMd(b.text, cwd, toSrc) }}
          />
        ),
      )}
    </div>
  );
}
