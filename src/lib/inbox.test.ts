import { describe, expect, it } from "vitest";
import { canMoveInboxSession, encodeCwd, normalizeCwd, sameCwd } from "./inbox";

describe("cwd helpers", () => {
  it("normalizes trailing slashes", () => {
    expect(normalizeCwd("/tmp/chats/")).toBe("/tmp/chats");
    expect(sameCwd("/tmp/chats/", "/tmp/chats")).toBe(true);
  });

  it("encodes like the rust session group", () => {
    expect(encodeCwd("/Users/foxie/Documents/Grok Chats")).toBe(
      "%2FUsers%2Ffoxie%2FDocuments%2FGrok%20Chats",
    );
  });

  it("only allows inbox → project", () => {
    const inbox = "/Users/me/Documents/Grok Chats";
    expect(canMoveInboxSession(inbox, "/proj", inbox)).toBeNull();
    expect(canMoveInboxSession("/proj", "/other", inbox)).toBe("只能把独立对话移入项目");
    expect(canMoveInboxSession(inbox, inbox, inbox)).toBe("目标不能是收件箱");
  });
});
