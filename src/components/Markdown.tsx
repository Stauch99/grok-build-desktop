import type { MouseEventHandler } from "react";
import { marked } from "marked";
import { splitAssistantBlocks } from "../lib/markdown";
import { linkifyLocalPaths, sanitizeHtml } from "../lib/text";
import { MermaidBlock } from "../MermaidBlock";

export function renderMd(text: string): string {
  return linkifyLocalPaths(
    sanitizeHtml(marked.parse(text, { async: false, gfm: true, breaks: true }) as string),
  );
}

export type MarkdownProps = {
  text: string;
  dark: boolean;
  className?: string;
  onClick?: MouseEventHandler<HTMLDivElement>;
};

/**
 * Shared markdown surface for assistant replies and file previews, so a
 * README renders in the preview pane exactly as it would in the thread —
 * including mermaid diagrams and clickable local paths.
 */
export function Markdown({ text, dark, className = "md", onClick }: MarkdownProps) {
  const blocks = splitAssistantBlocks(text);
  return (
    <div className={className} onClick={onClick}>
      {blocks.map((b, i) =>
        b.kind === "mermaid" ? (
          <MermaidBlock key={`mmd-${i}`} text={b.text} closed={b.closed} dark={dark} />
        ) : (
          <div key={`md-${i}`} dangerouslySetInnerHTML={{ __html: renderMd(b.text) }} />
        ),
      )}
    </div>
  );
}
