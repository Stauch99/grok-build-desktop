import { describe, expect, it } from "vitest";
import { rewindConfirmLabel, rewindHint } from "./rewind-unify";

describe("rewind semantics", () => {
  it("keeps file rewind and /rewind distinct", () => {
    expect(rewindHint("files")).toContain("/rewind");
    expect(rewindHint("conversation")).toContain("回到这里");
    expect(rewindConfirmLabel("files")).toBe("还原这些文件");
  });
});
