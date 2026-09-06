import { describe, expect, it } from "vitest";
import { renderMd, splitAssistantBlocks, unwrapMarkdownSoftBreaks } from "./markdown";

describe("splitAssistantBlocks", () => {
  it("keeps plain markdown as one block", () => {
    expect(splitAssistantBlocks("# hi\n\npara")).toEqual([{ kind: "md", text: "# hi\n\npara" }]);
  });

  it("extracts a closed mermaid fence", () => {
    const src = "见下图\n\n```mermaid\nflowchart LR\n  A-->B\n```\n完";
    expect(splitAssistantBlocks(src)).toEqual([
      { kind: "md", text: "见下图\n" },
      { kind: "mermaid", text: "flowchart LR\n  A-->B", closed: true },
      { kind: "md", text: "完" },
    ]);
  });

  it("marks an unclosed fence so render is not called", () => {
    const src = "```mermaid\nflowchart LR\n  A";
    const blocks = splitAssistantBlocks(src);
    expect(blocks).toEqual([{ kind: "mermaid", text: "flowchart LR\n  A", closed: false }]);
    expect(blocks[0].kind === "mermaid" && blocks[0].closed).toBe(false);
  });
});

describe("unwrapMarkdownSoftBreaks", () => {
  it("joins CJK prose without inserting a space", () => {
    expect(unwrapMarkdownSoftBreaks("拆家的\n人」")).toBe("拆家的人」");
  });

  it("joins Latin wrap with a space", () => {
    expect(unwrapMarkdownSoftBreaks("the child\nwill think")).toBe("the child will think");
  });

  it("keeps blank lines and fenced code", () => {
    expect(unwrapMarkdownSoftBreaks("一段。\n\n二段。")).toBe("一段。\n\n二段。");
    expect(unwrapMarkdownSoftBreaks("```\nfoo\nbar\n```")).toBe("```\nfoo\nbar\n```");
  });
});

describe("renderMd", () => {
  it("rewrites a markdown image onto a loadable local src", () => {
    const html = renderMd("![cover](/Users/foxie/out/cover.png)", "/Users/foxie/out", (p) => `asset://${p}`);
    expect(html).toContain('src="asset:///Users/foxie/out/cover.png"');
    expect(html).not.toContain('src="/Users/foxie/out/cover.png"');
  });

  it("inlines a cited video path", () => {
    const html = renderMd("见 assets/clip.mp4", "/work", (p) => `asset://${p}`);
    expect(html).toContain("<video ");
    expect(html).toContain('src="asset:///work/assets/clip.mp4"');
  });

  it("does not hard-break a CJK sentence that the model wrapped mid-paragraph", () => {
    const html = renderMd("但她后半句要改：不要让孩子把离婚理解成「拆家的\n人」，不管实际时间线如何。");
    expect(html).not.toMatch(/<br\s*\/?>/i);
    expect(html).toContain("拆家的人");
  });

  it("keeps a blank line as a paragraph break", () => {
    const html = renderMd("第一段。\n\n第二段。");
    expect(html.match(/<p>/g)?.length).toBe(2);
  });

  it("does not glue a following list onto the previous sentence", () => {
    const html = renderMd("说明如下：\n- 一项\n- 二项");
    expect(html).toContain("<li>");
    expect(html).toContain("一项");
  });
});
