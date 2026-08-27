import { describe, expect, it } from "vitest";
import { splitAssistantBlocks } from "./markdown";

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
