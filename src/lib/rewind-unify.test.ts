import { describe, expect, it } from "vitest";
import {
  REWIND_CONFIRM_PLACEHOLDER,
  REWIND_SKIP_NOTE,
  rewindPhraseConfirmed,
} from "./checkpoint";
import { rewindConfirmLabel, rewindHint } from "./rewind-unify";

describe("rewind semantics", () => {
  it("keeps file rewind and /rewind distinct", () => {
    expect(rewindHint("files")).toContain("/rewind");
    expect(rewindHint("conversation")).toContain("回到这里");
    expect(rewindConfirmLabel("files")).toBe("还原这些文件");
  });
});

describe("rewind confirm phrase", () => {
  it("accepts rewind case-insensitively", () => {
    expect(rewindPhraseConfirmed("rewind")).toBe(true);
    expect(rewindPhraseConfirmed("REWIND")).toBe(true);
    expect(rewindPhraseConfirmed("Rewind")).toBe(true);
    expect(rewindPhraseConfirmed(" rewind ")).toBe(true);
  });

  it("rejects anything else", () => {
    expect(rewindPhraseConfirmed("")).toBe(false);
    expect(rewindPhraseConfirmed("yes")).toBe(false);
    expect(rewindPhraseConfirmed("rewind!")).toBe(false);
  });

  it("locks the type-to-confirm and skip copy", () => {
    expect(REWIND_CONFIRM_PLACEHOLDER).toBe("输入 rewind 确认");
    expect(REWIND_SKIP_NOTE).toBe("将跳过（二进制或超过 2MB）");
  });
});
