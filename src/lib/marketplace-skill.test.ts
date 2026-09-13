import { describe, expect, it } from "vitest";
import { marketplaceInstallBlocked, marketplaceInstallDest, skillFolderName } from "./marketplace-skill";

describe("marketplace skill install", () => {
  it("accepts a skill-shaped folder name", () => {
    expect(skillFolderName("/tmp/pdf-review")).toBe("pdf-review");
    expect(skillFolderName("/tmp/Pdf")).toBeNull();
    expect(skillFolderName("/tmp/.")).toBeNull();
    expect(marketplaceInstallDest("/Users/me/.agents", "pdf-review")).toBe(
      "/Users/me/.agents/skills/pdf-review",
    );
    expect(marketplaceInstallBlocked(true)).toBe(true);
    expect(marketplaceInstallBlocked(false)).toBe(false);
  });
});
