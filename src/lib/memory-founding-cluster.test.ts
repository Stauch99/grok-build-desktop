import { describe, expect, it } from "vitest";
import {
  clusterEpisodes,
  domainKey,
  FOUNDING_MAX_DOMAINS,
  FOUNDING_ONE_SHOT_CHARS,
  shouldFoundingOneShot,
} from "./memory-founding-cluster";

describe("domainKey", () => {
  it("strips worktrees and maps known roots", () => {
    expect(domainKey("/Users/foxie/project_development/grok_build_desktop/.worktrees/feat-frost-theme")).toBe(
      "grok_build_desktop",
    );
    expect(domainKey("/Users/foxie/Documents/GlobalEdu/柏铎世家 标准材料")).toBe("GlobalEdu");
    expect(domainKey("/Users/foxie/Library/Mobile Documents/iCloud~md~obsidian/Documents/VaultWorld/40_Finance")).toBe(
      "40_Finance",
    );
  });
});

describe("clusterEpisodes", () => {
  it("collapses extra domains into other until FOUNDING_MAX_DOMAINS", () => {
    const lines = Array.from({ length: 20 }, (_, i) => ({ cwd: `/proj/app${i}`, text: "x" }));
    const groups = clusterEpisodes(lines);
    expect(groups.length).toBeLessThanOrEqual(FOUNDING_MAX_DOMAINS);
    expect(groups.some((g) => g.domain === "other")).toBe(true);
  });
});

describe("shouldFoundingOneShot", () => {
  it("one-shots at the cap and splits above it", () => {
    expect(shouldFoundingOneShot(FOUNDING_ONE_SHOT_CHARS)).toBe(true);
    expect(shouldFoundingOneShot(FOUNDING_ONE_SHOT_CHARS + 1)).toBe(false);
  });
});
