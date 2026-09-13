import { describe, expect, it } from "vitest";
import { firstOpenSkillAction } from "./first-open-import";

describe("firstOpenSkillAction", () => {
  it("offers import instead of deleting a real folder", () => {
    expect(firstOpenSkillAction({ destExists: false, destIsSymlink: false, canonicalDir: "/a/pdf" })).toBe("absent");
    expect(
      firstOpenSkillAction({
        destExists: true,
        destIsSymlink: true,
        destReadlink: "/a/pdf",
        canonicalDir: "/a/pdf",
      }),
    ).toBe("linked");
    expect(
      firstOpenSkillAction({ destExists: true, destIsSymlink: false, canonicalDir: "/a/pdf" }),
    ).toBe("offer-import");
    expect(
      firstOpenSkillAction({
        destExists: true,
        destIsSymlink: true,
        destReadlink: "/other",
        canonicalDir: "/a/pdf",
      }),
    ).toBe("offer-import");
  });
});
